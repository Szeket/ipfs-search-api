const { Client } = require('@elastic/elasticsearch');

const types = require('./types');

const client = new Client({
  node: 'http://localhost:9200',
  log: 'info',
});

const typeRe = /_type:(\w+)/;

// Legacy wrapper to extract type from _type in q
function typeFromQ(q) {
  const matches = q.match(typeRe);

  if (matches) {
    return {
      qType: matches[1],
      qWithoutType:
        q.substring(0, matches.index - 1)
        + q.substring(matches.index + matches[0].length),
    };
  }

  return {
    qType: null,
    qWithoutType: q,
  };
}

function search(q, type, page, pageSize) {
  const { qType, qWithoutType } = typeFromQ(q);

  const body = {
    query: {
      function_score: {
        query: {
          query_string: {
            query: qWithoutType,
            default_operator: 'AND',
          },
        },
        score_mode: 'sum',
        boost_mode: 'multiply',
        functions: [
          {
            weight: 1,
          },
          {
            filter: {
              range: {
                'last-seen': {
                  from: 'now-3M',
                },
              },
            },
            weight: 1,
          },
          {
            filter: {
              range: {
                'last-seen': {
                  from: 'now-1M',
                },
              },
            },
            weight: 1,
          },
          {
            filter: {
              range: {
                'last-seen': {
                  from: 'now-1d',
                },
              },
            },
            weight: 1,
          },
          // Also boost first-seen if they don't have last-seen defined
          {
            filter: {
              bool: {
                must_not: [
                  { exists: { field: 'last-seen' } },
                ],
                must: [
                  {
                    range: {
                      'first-seen': {
                        from: 'now-3M',
                      },
                    },
                  },
                ],
              },
            },
            weight: 1,
          },
          {
            filter: {
              bool: {
                must_not: [
                  { exists: { field: 'last-seen' } },
                ],
                must: [
                  {
                    range: {
                      'first-seen': {
                        from: 'now-1M',
                      },
                    },
                  },
                ],
              },
            },
            weight: 1,
          },
          {
            filter: {
              bool: {
                must_not: [
                  { exists: { field: 'last-seen' } },
                ],
                must: [
                  {
                    range: {
                      'first-seen': {
                        from: 'now-1d',
                      },
                    },
                  },
                ],
              },
            },
            weight: 1,
          },
        ],
      },
    },
    highlight: {
      order: 'score',
      require_field_match: false,
      encoder: 'html',
      fields: {
        '*': {
          number_of_fragments: 1,
          fragment_size: 250,
        },
      },
    },
    _source: [
      'metadata.title', 'metadata.name', 'metadata.description',
      'metadata.Content-Type', 'references', 'size', 'last-seen', 'first-seen',
    ],
  };

  // Decay functions are not working, somehow!
  // {
  //     // The relevancy of old documents is multiplied by at least one.
  //     "weight": 1
  // },
  // {
  //     // Seen today get a big boost
  //     "weight": 5,
  //     "gauss": {
  //         "last-seen": {
  //             "origin": "2017-04-07", // Change to current date
  //             "scale": "31d",
  //             "decay": 0.5
  //         }
  //     }
  // },
  // {
  //     // Seen this month gets a smaller boost blished this year get a boost
  //     "weight": 2,
  //     "gauss": {
  //         "last-seen": {
  //             "origin": "2017-04-07", // Change to current date
  //             "scale": "1M",
  //             "decay": 0.5
  //         }
  //     }
  // },
  // {
  //     // Seen in last 3 months get a smaller boost
  //     "weight": 1,
  //     "gauss": {
  //         "last-seen": {
  //             "origin": "2017-04-07", // Change to current date
  //             "scale": "3M",
  //             "decay": 0.5
  //         }
  //     }
  // }

  return client.search({
    index: types.indexesFromType(type || qType),
    body,
    size: pageSize,
    from: page * pageSize,
    timeout: '15s',
  });
}

module.exports = search;
