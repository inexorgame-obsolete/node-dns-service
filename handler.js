'use strict';
const process = require('process');
const net = require('net');
const AWS = require('aws-sdk');
const request = require('request');
const TTL = 3600; // Expire a domain name after 1 hour if deleted
console.time("init")

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
        TableName: 'nodes',
        Item: {
            'node': id,
            'revocationSecret': revocationSecret,
            'revoked': false
        }
    }

    docClient.put(params, (err, data) => {
        if (err) {
            callback(err, null);
        }

        let params = {
            ChangeBatch: {
                Changes: {
                    Action: 'CREATE',
                    ResourceRecordSet: {
                        Name: `${id}.${process.env.BASE_DOMAIN}`,
                        ResourceRecords: {
                            Value: context.identity.sourceIp
                        },
                        TTL: TTL,
                        Type: (net.isIPv4(context.identity.sourceIp)) ? 'A' : 'AAAA' // we don't check for invalid IP's because that's kinda pointless
                    },
                    Comment: `Auto generated DNS entry at ${new Date().toISOString()}`
                },
                HostedZoneId: process.env.HOSTED_ZONE_ID
            }
        }

        route53.changeResourceRecordSets(params, (err, data) => {
            if (err) {
                callback(err, null);
            } else {
                callback(null, data);
            }
        })
    })
}

/**
 * Revokes a node ID
 * @function revoke
 */
module.exports.revoke = (event, context, callback) => {
    if (context.queryStringParameters.node === undefined && context.queryStringParameters.revocationSecret === undefined) {
        callback(`Invalid request. Please provide both node and revocationSecret parameters`, null);
    }

    let params = {
        TableName: 'nodes',
        Item: {
            'node': context.queryStringParameters.node,
            'revocationSecret': context.queryStringParameters.revocationSecret,
            'revoked': true
        }
    }

    docClient.put(params, (err, data) => {
        if (err) {
            callback(err, null);
        }

        let params = {
            ChangeBatch: {
                Changes: {
                    Action: 'DELETE',
                    ResourceRecordSet: {
                        Name: `${id}.${process.env.BASE_DOMAIN}`,
                        ResourceRecords: {
                            Value: context.identity.sourceIp
                        },
                        TTL: TTL,
                        Type: (net.isIPv4(context.identity.sourceIp)) ? 'A' : 'AAAA' // we don't check for invalid IP's because that's kinda pointless
                    },
                    Comment: `Auto generated DNS entry at ${new Date().toISOString()}`
                },
                HostedZoneId: process.env.HOSTED_ZONE_ID
            }
        }

        route53.changeResourceRecordSets(params, (err, data) => {
            if (err) {
                callback(err, null);
            } else {
                callback(null, data);
            }
        })
    })
}

/**
 * Updates aliases according to the alias config
 * @function update_aliases
 */
module.exports.update_aliases = (event, context, callback) => {
    const request = require('request');
    request(process.env.BASE_DOMAIN, (error, response, body) => {
        if (error) {
            callback(error, null);
        }

        try {
            const aliases = JSON.parse(body);

            let params = {
                ChangeBatch: {
                    Changes: [],
                    HostedZoneId: process.env.HOSTED_ZONE_ID
                }
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
                        ResourceRecords: {
                            Value: alias.node
                        },
                        TTL: TTL,
                        Type: 'CNAME'
                    },
                    Comment: `Automatically inserted alias ${alias.alias} at ${new Date().toISOString()}`
                })
            })

            if (aliases.length) {
                route53.changeResourceRecordSets(params, (err, data) => {
                    if (err) {
                        callback(err, null);
                    } else {
                        callback(null, data);
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