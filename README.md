polyclay-levelup
==============

A [LevelUP](https://github.com/rvagg/node-levelup) persistence adapter for [Polyclay](https://github.com/ceejbot/polyclay). You must specify which LevelDB implementation you'd like to use as a back end for LevelUP, such as [LevelDOWN](https://github.com/rvagg/node-leveldown/).

[![Build Status](https://secure.travis-ci.org/ceejbot/polyclay-levelup.png)](http://travis-ci.org/ceejbot/polyclay-levelup)

## How-to

For LevelUP:

```javascript
var polyclay = require('polyclay'),
    LevelupAdapter = require('polyclay-levelup');

var Widget = polyclay.Model.buildClass({
    properties:
    {
        name: 'string',
        description: 'string'
    },
    singular: 'widget',
    plural: 'widgets'
});
polyclay.persist(Widget, 'name');

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
