'use strict';
const process = require('process');
const net = require('net');
const AWS = require('aws-sdk');
const request = require('request');
const TTL = 3600; // Expire a domain name after 1 hour if deleted
const TABLE = 'nodes'; // The default name of the table

let docClient = new AWS.DynamoDB.DocumentClient();
let route53 = new AWS.Route53();

/**
 * Registers a new node ID
 * @function register
 */
module.exports.register = (event, context, callback) => {
    const crypto = require('crypto');
    const uuid = require('uuid/v1');
    const id = uuid();

    let revocationSecret = crypto.randomBytes(20).toString("hex");

    let params = {
        TableName: TABLE,
        Item: {
            'node': id,
            'revocationSecret': revocationSecret,
            'revoked': false
        }
    }

    docClient.put(params, (err, data) => {
        if (err) {
            callback(err);
        }

        let params = {
            ChangeBatch: {
                Changes: [
                    {
                        Action: 'CREATE',
                        ResourceRecordSet: {
                            Name: `${id}.${process.env.BASE_DOMAIN}`,
                            ResourceRecords: [
                                {
                                    Value: event.headers['X-Forwarded-For'].split(',')[0]
                                }
                            ],
                            TTL: TTL,
                            Type: (net.isIPv4(event.headers['X-Forwarded-For'].split(',')[0])) ? 'A' : 'AAAA' // we don't check for invalid IP's because that's kinda pointless
                        },
                    }
                ],
                Comment: `Auto generated DNS entry at ${new Date().toISOString()}`
            },
            HostedZoneId: process.env.HOST_ZONE_ID
        }

        route53.changeResourceRecordSets(params, (err, data) => {
            if (err) {
                callback(err);
            } else {
                callback(null, {
                    statusCode: 200,
                    body: JSON.stringify({
                        'node': id,
                        'revocationSecret': revocationSecret
                    })
                });
            }
        })
    })
}

/**
 * Revokes a node ID
 * @function revoke
 */
module.exports.revoke = (event, context, callback) => {
    if (event.queryStringParameters.node === undefined && event.queryStringParameters.revocationSecret === undefined) {
        callback(`Invalid request. Please provide both node and revocationSecret parameters`, null);
    }

    let params = {
        TableName: TABLE,
        Key: {
            'node': event.queryStringParameters.node
        }
    }

    docClient.get(params, (err, data) => {
        if (err) {
            callback(err);
        } else {
            if (data.Item.revoked) {
                callback(new Error(`Trying to revoke already revoked node ${event.queryStringParameters.node}`))
            } else if (data.Item.revocationSecret != event.queryStringParameters.revocationSecret) {
                callback(new Error(`Trying to update node ${event.queryStringParameters.node} with invalid revocationSecret`))
            }

            let params = {
                TableName: TABLE,
                Key: {
                    'node': event.queryStringParameters.node
                },
                ExpressionAttributeNames: {
                    "#R": "revoked",
                },
                ExpressionAttributeValues: {
                    ":r": true
                },
                UpdateExpression: 'SET #R = :r'
            }

            docClient.update(params, (err, data) => {
                if (err) {
                    callback(err);
                }

                let params = {
                    ChangeBatch: {
                        Changes: [
                            {
                                Action: 'DELETE',
                                ResourceRecordSet: {
                                    Name: `${event.queryStringParameters.node}.${process.env.BASE_DOMAIN}`,
                                    ResourceRecords: [
                                        {
                                            Value: event.headers['X-Forwarded-For'].split(',')[0]
                                        }
                                    ],
                                    TTL: TTL,
                                    Type: (net.isIPv4(event.headers['X-Forwarded-For'].split(',')[0])) ? 'A' : 'AAAA' // we don't check for invalid IP's because that's kinda pointless
                                },
                            }
                        ],
                        Comment: `Auto generated DNS deletion at ${new Date().toISOString()}`
                    },
                    HostedZoneId: process.env.HOST_ZONE_ID
                }

                route53.changeResourceRecordSets(params, (err, data) => {
                    if (err) {
                        callback(err);
                    } else {
                        callback(null, {
                            statusCode: 200,
                            body: JSON.stringify({
                                message: `Successfully revoked node ${event.queryStringParameters.node}`
                            })
                        });
                    }
                })
            })
        }
    })
}

/**
 * Updates aliases according to the alias config
 * @function update_aliases
 */
module.exports.update_aliases = (event, context, callback) => {
    request(process.env.ALIAS_FILE, (error, response, body) => {
        if (error) {
            callback(error, null);
        }

        try {
            const { aliases } = JSON.parse(body);

            let params = {
                ChangeBatch: {
                    Changes: [

                    ],
                    Comment: `Automatically inserted ${aliases.length} aliases at ${new Date().toISOString()}`
                },
                HostedZoneId: process.env.HOST_ZONE_ID
            }

            /**
             * Alias is a list of records in the following format
             * aliases = [
             *  {
             *      alias: name,
             *      node: id
             *  }
             * ]
             */
            aliases.forEach((alias) => {
                params.ChangeBatch.Changes.push({
                    Action: 'UPSERT',
                    ResourceRecordSet: {
                        Name: `${alias.alias}.${process.env.BASE_DOMAIN}`,
                        ResourceRecords: [
                            {
                                Value: alias.node
                            }
                        ],
                        TTL: TTL,
                        Type: 'CNAME'
                    }
                })
            })

            if (aliases.length) {
                route53.changeResourceRecordSets(params, (err, data) => {
                    if (err) {
                        callback(err, null);
                    } else {
                        callback(null, {
                            statusCode: 200,
                            data: JSON.stringify(data)
                        });
                    }
                })
            } else {
                callback(`Not executing alias command because the alias list is empty at ${new Date().toISOString()}`);
            }
        } catch (err) {
            callback(err, null);
        }
    })
}