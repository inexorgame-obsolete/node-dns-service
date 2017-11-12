'use strict';
const process = require('process');
const AWS = require('aws-sdk');
let docClient = new AWS.DynamoDB.DocumentClient({region: process.env.REGION});

/**
 * Registers a new node ID
 * @function register
 */
module.exports.register = (event, context, callback) => {
    const crypto = require('crypto');
    const uuid = require('uuid/v1');

    let revocationSecret = crypto.randomBytes(20).toString("hex");

    let params = {
        TableName: 'nodes',
        Item: {
            'node': uuid(),
            'revocationSecret': revocationSecret,
            'revoked': false
        }
    }

    docClient.put(params, (err, data) => {
        if (err) {
            callback(err, null);
        }

        // TODO: Put DNS record
        callback(null, data);
    })
}

/**
 * Revokes a node ID
 * @function revoke
 */
module.exports.revoke = (event, context, callback) => {
    // TODO: Get uuid and revocationSecret from request

    let params = {
        TableName: 'nodes',
        Item: {
            'node': uuid,
            'revocationSecret': revocationSecret,
            'revoked': true
        }
    }

    docClient.put(params, (err, data) => {
        if (err) {
            callback(err, null);
        }

        // TODO: Delete DNS record
        callback(null, data);
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

            // This should be tuples of: alias - node id
            aliases.forEach((alias) => {
                // TODO: Put DNS record
            });
            callback(null, aliases);
        } catch (err) {
            callback(err, null);
        }
    })
}