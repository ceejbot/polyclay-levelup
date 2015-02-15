// Levelup storage interface.
// Objects are stored as hashes.

var
	_        = require('lodash'),
	assert   = require('assert'),
	async    = require('async'),
	fs       = require('fs'),
	level    = require('level'),
	path     = require('path'),
	sublevel = require('level-sublevel'),
	indexing = require('level-indexing')
	;

var LevelupAdapter = module.exports = function LevelupAdapter()
{
};

LevelupAdapter.prototype.db          = null;
LevelupAdapter.prototype.attachdb    = null;
LevelupAdapter.prototype.dbname      = '';
LevelupAdapter.prototype.objects     = null;
LevelupAdapter.prototype.constructor = null;

LevelupAdapter.prototype.configure = function(opts, modelfunc)
{
	assert(opts.dbpath || (opts.db && opts.attachdb ), 'you must specify either a db or a dbpath');
	assert(typeof modelfunc === 'function', 'you must pass a polyclay model constructor function');

	if (opts.db)
	{
		this.db = opts.db;
		this._attachdb = opts.attachdb;
	}
	else
	{
		var dir = path.dirname(opts.dbpath);
		if (!fs.existsSync(dir))
			fs.mkdirSync(dir);

		this.db = level(opts.dbpath, {encoding: 'json'});
		this._attachdb = level(path.join(opts.dbpath, 'attachments'), {encoding: 'binary'});
	}

	this.dbname = opts.dbname || modelfunc.prototype.plural;
	this.objects = sublevel(this.db).sublevel(this.dbname);
	this.attachdb = sublevel(this._attachdb).sublevel(this.dbname);

	if (modelfunc.prototype.__index)
	{
		var self = this;

		var indexes = modelfunc.prototype.__index;
		if (!Array.isArray(indexes))
			indexes = [ indexes ];

		indexing(this.objects);
		var db = this.objects;
		_.each(indexes, function(property)
		{
			db.index(property);
			var getter = 'by' + property[0].toUpperCase() + property.substr(1);
			modelfunc[getter] = function(value, callback)
			{
				db[getter](value, function(err, struct)
				{
					if (err) return callback(err);
					callback(null, self.inflate(struct));
				});
			};
		});

		modelfunc.find = function find(input, callback)
		{
			db.find(input, function(err, struct)
			{
				if (err) return callback(err);
				callback(null, self.inflate(struct));
			});
		};
	}

	this.constructor = modelfunc;
};

LevelupAdapter.prototype.provision = function(callback)
{
	// Nothing to do?
	callback(null);
};

LevelupAdapter.prototype.shutdown = function(callback)
{
	var self = this;
	self.db.close(function(err)
	{
		self._attachdb.close(callback);
	});
};

LevelupAdapter.prototype.all = function(callback)
{
	var keys = [];
	this.objects.createKeyStream().on('data', function (data)
	{
		keys.push(data);
	}).on('end', function()
	{
		callback(null, keys);
	}).on('err', function(err)
	{
		callback(err);
	});
};

LevelupAdapter.prototype.keystream = function()
{
	return this.objects.createKeyStream();
};

LevelupAdapter.prototype.save = function(object, json, callback)
{
	if (!object.key || !object.key.length)
		throw(new Error('cannot save a document without a key'));

	var self = this;
	var attachSub = this.attachdb.sublevel(object.key);

	var payload = LevelupAdapter.flatten(json);
	var ops = [];

	for (var i = 0; i < payload.attachments.length; i++)
	{
		var k = payload.attachments[i].name;
		var body = payload.attachments[i].body;
		if (!body || !body.length)
			ops.push({ type: 'del', key: k });
		else
			ops.push({ type: 'put', key: k, value: body });
	}

	this.objects.put(object.key, payload.body, function(err, response)
	{
		if (err) return callback(err);
		if (ops.length === 0)
			return callback(null, 'OK');

		attachSub.batch(ops, function(err)
		{
			callback(err, err ? null : 'OK');
		});
	});
};
LevelupAdapter.prototype.update = LevelupAdapter.prototype.save;

LevelupAdapter.prototype.get = function(key, callback)
{
	var self = this;
	if (Array.isArray(key))
		return this.getBatch(key, callback);

	this.objects.get(key, function(err, payload)
	{
		if (err && (err.name === 'NotFoundError'))
			return callback(null, null);
		if (err) return callback(err);
		var object = self.inflate(payload);
		callback(null, object);
	});
};

LevelupAdapter.prototype.stream = function()
{
	this.objects.createReadStream();


};

LevelupAdapter.prototype.getBatch = function(keylist, callback)
{
	var self = this;
	var result = [];
	var ptr = 0;

	function continuer(err, payload)
	{
		if (err && (err.name !== 'NotFoundError')) return callback(err);
		if (!err)
			result.push(self.inflate(payload));

		ptr++;
		if (ptr >= keylist.length)
			return callback(null, result);

		self.objects.get(keylist[ptr], continuer);
	}

	self.objects.get(keylist[ptr], continuer);
};

LevelupAdapter.prototype.merge = function(key, attributes, callback)
{
	var self = this;
	self.objects.get(key, function(err, payload)
	{
		if (err) return callback(err);
		_.assign(payload, attributes);
		self.objects.put(key, payload, callback);
	});
};

LevelupAdapter.prototype.remove = function(object, callback)
{
	var self = this;
	var key;
	if (typeof object === 'string')
		key = object;
	else
		key = object.key;

	this.objects.del(key, function(err, response)
	{
		if (err) return callback(err);
		self.removeAttachmentsFor(key, callback);
	});
};

LevelupAdapter.prototype.removeAttachmentsFor = function(key, callback)
{
	var self = this;
	var actions = [];

	var attachSub = this.attachdb.sublevel(key);

	attachSub.createKeyStream().on('data', function (data)
	{
		actions.push({ type: 'del', key: data });
	}).on('end', function()
	{
		if (actions.length === 0)
			return callback(null, 'OK');

		attachSub.batch(actions, function(err)
		{
			callback(err, err ? null : 'OK');
		});
	}).on('err', function(err)
	{
		callback(err);
	});
};

LevelupAdapter.prototype.destroyMany = function(objects, callback)
{
	var self = this;
	var actions = [], ops = [], k;
	_.each(objects, function(obj)
	{
		if (typeof obj === 'string')
			k = obj;
		else
			k = obj.key;

		ops.push({ type: 'del', key: k });
		actions.push(function(cb) { self.removeAttachmentsFor(k, cb); });
	});

	actions.push(function(cb) { self.objects.batch(ops, cb); });
	async.parallel(actions, function(err, replies)
	{
		if (err) return callback(err);
		callback(null, objects.length);
	});
};

LevelupAdapter.prototype.attachment = function(key, name, callback)
{
	var attachSub = this.attachdb.sublevel(key);

	attachSub.get(name, function(err, payload)
	{
		if (err && err.name === 'NotFoundError')
			return callback(null, null);
		callback(err, payload);
	});
};

LevelupAdapter.prototype.saveAttachment = function(object, attachment, callback)
{
	var attachSub = this.attachdb.sublevel(object.key);
	attachSub.put(attachment.name, attachment.body, callback);
};

LevelupAdapter.prototype.removeAttachment = function(object, name, callback)
{
	this.attachdb.sublevel(object.key).del(name, callback);
};

LevelupAdapter.prototype.inflate = function(payload)
{
	if (payload === null)
		return;
	var object = new this.constructor();
	object.initFromStorage(payload);
	return object;
};

LevelupAdapter.flatten = function(json)
{
	var payload = {};
	payload.attachments = [];

	if (json._attachments)
	{
		var attaches = Object.keys(json._attachments);
		for (var i = 0; i < attaches.length; i++)
		{
			var attachment = json._attachments[attaches[i]];
			payload.attachments.push({
				name: attaches[i],
				body: attachment.body
			});
		}
		delete json._attachments;
	}

	payload.body = _.clone(json);

	return payload;
};
