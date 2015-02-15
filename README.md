polyclay-levelup
==============

A [LevelUP](https://github.com/rvagg/node-levelup) persistence adapter for [Polyclay](https://github.com/ceejbot/polyclay).

[![on npm](http://img.shields.io/npm/v/numbat-emitter.svg?style=flat)](https://www.npmjs.org/package/polyclay-levelup)  [![Tests](http://img.shields.io/travis/ceejbot/polyclay-levelup.svg?style=flat)](http://travis-ci.org/ceejbot/polyclay-levelup) ![Coverage](http://img.shields.io/badge/coverage-95%25-green.svg?style=flat) [![Dependencies](http://img.shields.io/david/ceejbot/polyclay-levelup.svg?style=flat)](https://david-dm.org/ceejbot/polyclay-levelup)

## How-to

For LevelUP:

```javascript
var polyclay = require('polyclay'),
    LevelupAdapter = require('polyclay-levelup');

var Widget = polyclay.Model.buildClass({
    properties:
    {
        partnum: 'string'
        name: 'string',
        description: 'string',
    },
    singular: 'widget',
    plural: 'widgets',
    index: [ 'name' ]
});
polyclay.persist(Widget, 'partnum');

var options =
{
    dbpath: '/path/to/leveldb/dir',
    dbname: 'widgets' // optional
};
Widget.setStorage(options, polyclay.LevelupAdapter);
```

The Levelup object is available at `obj.adapter.db`. The objects store is a [level-sublevel](https://github.com/dominictarr/level-sublevel) object at `obj.adapter.objects`. The attachments data store is available at `obj.adapter.attachdb`.  Sublevel is used to namespace keys so you can safely re-use a leveldb database you're using for other purposes. Note that this adapter requires json encoding.

You may also pass pre-existing sublevel-wrapped leveldb objects to the storage function:

```javascript
var levelup  = require('levelup'),
    sublevel = require('level-sublevel')
    path     = require('path');

var options =
{
    db:       sublevel(levelup('./db/bigdb', {encoding: 'json'})),
    attachdb: sublevel(levelup(path.join('.', 'db', 'bigdb', 'attachments'), {encoding: 'binary'})),
};
Widget.setStorage(options, polyclay.LevelupAdapter);
```

If you pass in pre-constructed levelup instances, it's up to you to make sure they're
wrapped with sublevel() and have the correct encodings.

## Secondary indexes

The adapter uses [level-indexing](https://github.com/stagas/level-indexing) to provide secondary indexes on fields you select. To add secondary indexes, pass an array of property names in the `index` field of the model options. The example above creates a secondary index on the `name` field of the model.

`Widget.find()` is a version of the find function described in the level-indexing docs that returns a fully-constructed model instead of a json structure. Any `byFieldName()` functions are also made available on the Model constructor (aka the class); the versions on the model return fully-constructed objects.

TODO: promisify these finders so you can either pass a callback or not as you prefer.
