polyclay-levelup
==============

A LevelUP persistence adapter for [Polyclay](https://github.com/ceejbot/polyclay).

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

The Levelup object is available at `obj.adapter.db`. The attachments data store is available at `obj.adapter.attachdb`.

