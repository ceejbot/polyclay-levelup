/*global describe:true, it:true, before:true, after:true */

var
	demand = require('must')
	;

var
	child          = require('child_process'),
	fs             = require('fs'),
	path           = require('path'),
	polyclay       = require('polyclay'),
	levelup        = require('levelup'),
	sublevel       = require('level-sublevel'),
	util           = require('util'),
	LevelupAdapter = require('../index')
	;

var testDir = process.cwd();
if (path.basename(testDir) !== 'test')
	testDir = path.join(testDir, 'test');
var attachmentdata = fs.readFileSync(path.join(testDir, 'test.png'));

describe('levelup adapter', function()
{
	var modelDefinition =
	{
		properties:
		{
			key:           'string',
			name:          'string',
			created:       'date',
			foozles:       'array',
			snozzers:      'hash',
			is_valid:      'boolean',
			count:         'number',
			required_prop: 'string',
		},
		optional: [ 'computed', 'ephemeral' ],
		required: [ 'name', 'is_valid', 'required_prop'],
		singular: 'model',
		plural: 'models',
		index: [ 'name' ],
		initialize: function()
		{
			this.ran_init = true;
		},
	};

	var Model, instance, another, hookTest, hookid;

	before(function()
	{
		Model = polyclay.Model.buildClass(modelDefinition);
		polyclay.persist(Model);

		if (!fs.existsSync('./test/TestDB'))
			fs.mkdirSync('./test/TestDB');
	});

	it('can take an existing levelup db object in its options', function(done)
	{
		var options =
		{
			db:       sublevel(levelup('./test/TestDB', {encoding: 'json'})),
			attachdb: sublevel(levelup(path.join('./test/TestDB', 'attachments'), {encoding: 'binary'})),
		};

		var M2 = polyclay.Model.buildClass(modelDefinition);
		polyclay.persist(M2);
		M2.setStorage(options, LevelupAdapter);
		M2.adapter.must.be.truthy();
		M2.adapter.db.must.be.an.object();
		M2.adapter.constructor.must.equal(M2);

		M2.adapter.shutdown(function()
		{
			done();
		});
	});

	it('can also take a dbpath in its options', function()
	{
		var options =
		{
			dbpath: './test/TestDB',
			dbname: 'test'
		};

		Model.setStorage(options, LevelupAdapter);
		Model.adapter.must.be.an.object();
		Model.adapter.db.must.be.an.object();
		Model.adapter.must.have.property('objects');
		Model.adapter.objects.must.be.an.object();
		Model.adapter.constructor.must.equal(Model);
	});

	it('provision does nothing', function(done)
	{
		Model.provision(function(err)
		{
			demand(err).not.exist();
			done();
		});
	});

	it('throws when asked to save a document without a key', function()
	{
		var noID = function()
		{
			var obj = new Model();
			obj.name = 'idless';
			obj.save(function(err, reply) {});
		};

		noID.must.throw();
	});

	it('can save a document in the db', function(done)
	{
		instance = new Model();
		instance.update(
		{
			key: '1',
			name: 'test',
			created: Date.now(),
			foozles: ['three', 'two', 'one'],
			snozzers: { field: 'value' },
			is_valid: true,
			count: 3,
			required_prop: 'requirement met',
			computed: 17
		});

		instance.save(function(err, reply)
		{
			demand(err).not.exist();
			reply.must.be.truthy();
			done();
		});
	});

	it('can retrieve the saved document', function(done)
	{
		Model.get(instance.key, function(err, retrieved)
		{
			demand(err).not.exist();
			retrieved.must.be.truthy();
			retrieved.must.be.an.object();
			retrieved.key.must.equal(instance.key);
			retrieved.name.must.equal(instance.name);
			retrieved.created.getTime().must.equal(instance.created.getTime());
			retrieved.is_valid.must.equal(instance.is_valid);
			retrieved.count.must.equal(instance.count);
			retrieved.computed.must.equal(instance.computed);
			done();
		});
	});

	it('decorates the object db with index functions if requested', function()
	{
		var db = Model.adapter.objects;
		db.must.have.property('index');
		db.index.must.be.a.function();

		db.must.have.property('find');
		db.find.must.be.a.function();
	});

	it('can find objects by indexed fields', function(done)
	{
		var db = Model.adapter.objects;
		db.must.have.property('byName');
		db.byName.must.be.a.function();

		db.byName('test', function(err, value)
		{
			demand(err).not.exist();
			value.must.be.truthy();
			value.must.be.an.object();
			value.key.must.equal('1');

			done();
		});
	});

	it('adds the equivalent model-finding functions to the Model prototype', function(done)
	{
		Model.must.have.property('byName');
		Model.byName.must.be.a.function();

		Model.byName('test', function(err, obj)
		{
			demand(err).not.exist();
			obj.must.be.truthy();
			obj.must.be.an.object();
			obj.must.be.instanceof(Model);
			obj.key.must.equal('1');

			done();
		});
	});

	it('can update the document', function(done)
	{
		instance.name = "New name";
		instance.isDirty().must.be.true();
		instance.save(function(err, response)
		{
			demand(err).not.exist();
			response.must.be.a.string();
			response.must.equal('OK');
			instance.isDirty().must.equal(false);
			done();
		});
	});

	it('can fetch in batches', function(done)
	{
		var ids = [ instance.key ];
		var obj = new Model();
		obj.name = 'two';
		obj.key = '2';
		obj.save(function(err, response)
		{
			ids.push(obj.key);

			Model.get(ids, function(err, itemlist)
			{
				demand(err).not.exist();
				itemlist.must.be.an.array();
				itemlist.length.must.equal(2);
				done();
			});
		});
	});

	it('the adapter get() can handle an id or an array of ids', function(done)
	{
		var ids = [ '1', '2' ];
		Model.adapter.get(ids, function(err, itemlist)
		{
			demand(err).not.exist();
			itemlist.must.be.an.array();
			itemlist.length.must.equal(2);
			done();
		});
	});

	it('can fetch all', function(done)
	{
		Model.all(function(err, itemlist)
		{
			demand(err).not.exist();
			itemlist.must.be.an.array();
			itemlist.length.must.equal(2);
			done();
		});
	});

	it('constructMany() retuns an empty list when given empty input', function(done)
	{
		Model.constructMany([], function(err, results)
		{
			demand(err).not.exist();
			results.must.be.an.array();
			results.length.must.equal(0);
			done();
		});
	});

	it('merge() updates properties then saves the object', function(done)
	{
		Model.get('2', function(err, item)
		{
			demand(err).not.exist();

			item.merge({ is_valid: true, count: 1023 }, function(err, response)
			{
				demand(err).not.exist();
				Model.get(item.key, function(err, stored)
				{
					demand(err).not.exist();
					stored.count.must.equal(1023);
					stored.is_valid.must.equal(true);
					stored.name.must.equal(item.name);
					done();
				});
			});
		});
	});

	it('can add an attachment type', function()
	{
		Model.defineAttachment('frogs', 'text/plain');
		Model.defineAttachment('avatar', 'image/png');

		instance.set_frogs.must.be.a.function();
		instance.fetch_frogs.must.be.a.function();
		var property = Object.getOwnPropertyDescriptor(Model.prototype, 'frogs');
		property.get.must.be.a.function();
		property.set.must.be.a.function();
	});

	it('can save attachments', function(done)
	{
		instance.avatar = attachmentdata;
		instance.frogs = 'This is bunch of frogs.';
		instance.save(function(err, response)
		{
			demand(err).not.exist();
			instance.isDirty().must.equal.false;
			done();
		});
	});

	it('can retrieve attachments', function(done)
	{
		Model.get(instance.key, function(err, retrieved)
		{
			retrieved.fetch_frogs(function(err, frogs)
			{
				demand(err).not.exist();
				frogs.must.be.a.string();
				frogs.must.equal('This is bunch of frogs.');
				retrieved.fetch_avatar(function(err, imagedata)
				{
					demand(err).not.exist();
					Buffer.isBuffer(imagedata).must.be.true();
					imagedata.length.must.equal(attachmentdata.length);
					done();
				});
			});
		});
	});

	it('can update an attachment', function(done)
	{
		instance.frogs = 'Poison frogs are awesome.';
		instance.save(function(err, response)
		{
			demand(err).not.exist();
			Model.get(instance.key, function(err, retrieved)
			{
				demand(err).not.exist();
				retrieved.fetch_frogs(function(err, frogs)
				{
					demand(err).not.exist();
					frogs.must.equal(instance.frogs);
					retrieved.fetch_avatar(function(err, imagedata)
					{
						demand(err).not.exist();
						imagedata.length.must.equal(attachmentdata.length);
						done();
					});
				});
			});
		});
	});

	it('can store an attachment directly', function(done)
	{
		instance.frogs = 'Poison frogs are awesome, but I think sand frogs are adorable.';
		instance.saveAttachment('frogs', function(err, response)
		{
			demand(err).not.exist();
			Model.get(instance.key, function(err, retrieved)
			{
				demand(err).not.exist();
				retrieved.fetch_frogs(function(err, frogs)
				{
					demand(err).not.exist();
					frogs.must.equal(instance.frogs);
					done();
				});
			});
		});
	});

	it('saveAttachment() clears the dirty bit', function(done)
	{
		instance.frogs = 'This is bunch of frogs.';
		instance.isDirty().must.equal(true);
		instance.saveAttachment('frogs', function(err, response)
		{
			demand(err).not.exist();
			instance.isDirty().must.equal(false);
			done();
		});
	});

	it('can remove an attachment', function(done)
	{
		instance.removeAttachment('frogs', function(err, deleted)
		{
			demand(err).not.exist();
			deleted.must.be.true();
			done();
		});
	});

	it('caches an attachment after it is fetched', function(done)
	{
		instance.avatar = attachmentdata;
		instance.save(function(err, response)
		{
			demand(err).not.exist();
			instance.isDirty().must.be.false();
			instance.fetch_avatar(function(err, imagedata)
			{
				demand(err).not.exist();
				var cached = instance.__attachments['avatar'].body;
				cached.must.be.truthy();
				(cached instanceof Buffer).must.equal(true);
				polyclay.dataLength(cached).must.equal(polyclay.dataLength(attachmentdata));
				done();
			});
		});
	});

	it('can fetch an attachment directly', function(done)
	{
		Model.adapter.attachment('1', 'avatar', function(err, body)
		{
			demand(err).not.exist();
			(body instanceof Buffer).must.equal(true);
			polyclay.dataLength(body).must.equal(polyclay.dataLength(attachmentdata));
			done();
		});
	});

	it('removes an attachment when its data is set to null', function(done)
	{
		instance.avatar = null;
		instance.save(function(err, response)
		{
			demand(err).not.exist();
			Model.get(instance.key, function(err, retrieved)
			{
				demand(err).not.exist();
				retrieved.fetch_avatar(function(err, imagedata)
				{
					demand(err).not.exist();
					demand(imagedata).not.exist();
					done();
				});
			});
		});
	});

	it('can remove a document from the db', function(done)
	{
		instance.destroy(function(err, deleted)
		{
			demand(err).not.exist();
			deleted.must.be.truthy();
			instance.destroyed.must.be.true();
			done();
		});
	});

	it('removes attachments when it removes a document', function(done)
	{
		var obj = new Model();
		obj.key = 'tmp';
		obj.avatar = attachmentdata;
		obj.save(function(err, response)
		{
			demand(err).not.exist();
			obj.destroy(function(err, deleted)
			{
				demand(err).not.exist();
				deleted.must.be.truthy();

				Model.adapter.attachment('tmp', 'avatar', function(err, payload)
				{
					demand(err).not.exist();
					demand(payload).equal(null);
					done();
				});
			});
		});
	});

	it('can remove documents in batches', function(done)
	{
		var obj2 = new Model();
		obj2.key = '4';
		obj2.name = 'two';
		obj2.avatar = attachmentdata;
		obj2.save(function(err, response)
		{
			Model.get('2', function(err, obj)
			{
				demand(err).not.exist();
				obj.must.be.an.object();

				var itemlist = [obj, obj2.key];
				Model.destroyMany(itemlist, function(err, response)
				{
					demand(err).not.exist();
					response.must.equal(2);
					done();
				});
			});
		});
	});

	it('removes attachments when it removes in batches', function(done)
	{
		Model.adapter.attachment('4', 'avatar', function(err, payload)
		{
			demand(err).not.exist();
			demand(payload).be.null();
			done();
		});
	});

	it('destroyMany() does nothing when given empty input', function(done)
	{
		Model.destroyMany(null, function(err)
		{
			demand(err).not.exist();
			done();
		});
	});

	it('destroy responds with an error when passed an object without an id', function(done)
	{
		var obj = new Model();
		obj.destroy(function(err, destroyed)
		{
			err.must.be.an.object();
			err.message.must.equal('cannot destroy object without an id');
			done();
		});
	});

	it('destroy responds with an error when passed an object that has already been destroyed', function(done)
	{
		var obj = new Model();
		obj.key = 'foozle';
		obj.destroyed = true;
		obj.destroy(function(err, destroyed)
		{
			err.must.be.an.object();
			err.message.must.equal('object already destroyed');
			done();
		});
	});

	it('inflate() handles bad json by assigning properties directly', function()
	{
		var bad =
		{
			name: 'this is not valid json'
		};
		var result = Model.adapter.inflate(bad);
		result.name.must.equal(bad.name);
	});

	it('inflate() does not construct an object when given a null payload', function()
	{
		var result = Model.adapter.inflate(null);
		demand(result).not.exist();
	});

	after(function(done)
	{
		Model.adapter.shutdown(function(err)
		{
			child.exec('rm -rf ./test/TestDB', function(err, stdout, stderr)
			{
				done();
			});
		});
	});

});
