node-dns-service
----------------

This is a DNS service prototype for registering domains based on a UUID system.
It makes use of Amazon Web Service, specifically using

- AWS Lambda
- AWS DynamoDB
- AWS Route 53
- AWS S3
- AWS CloudFormation

# Overview

## Why a DNS service

As a common base for many flex features (such as OpenID Connect based Authentication), a flex instance needs to have two things

- a valid SSL certificate
- consequently, a domain name, to request this certificate

This requires an administrator to have knowledge of SSL technology, and to own a DNS.
To overcome this problem, we wrote the `node-dns-service`, which tries to solve these problems. It provides domain names to a requesting party, which can then use Let's Encrypt to issue a SSL certificate for themselves.

## Flow

There is two methods in the service flow

### `register`
This will register a new node to issue a domain for.
It returns both the `node` id, and a `revocationSecret`.
You can pass `virtual=True` as a parameter, which will mock the request, not creating a DNS entry.

In case `virtual=False` then a DNS record will be created, pointing to the requesters `A` or `AAAA` record, depending on the supported protocol(s).

### `revoke`
You can call the `revoke` method by using `DELETE` on the API, passing along the `node` id (as `node` parameter) of your node and `revocationSecret` as `revocationSecret` parameter.
This will

- remove the DNS entry for your node
- disable the `node` so it can not be used any longer in the future

## Aliases 

You can add an alias for your node using our `alias.json` file on GitHub (pull request).
Once we approved your alias, a CNAME record will be added for the specified `node` id.

# Developer

## Toolchain
We use the following toolchain

- `serverless` for deployment and integration testing
- `eslint` for linting

We also have a set of basic enviroment variables, which you can find in the `serverless.yml#provider` config.


## Deploying

### Preriquites
You will need:

- a hosted zone for the domain

Everything else will be set up for you automagically.

### Get started

After you created an IAM user and a hosted zone do the following

- update the `BASE_DOMAIN`, `ALIAS_FILE` environment variables in `serverless.yml`
- update the `HOST_ZONE_ID` variable in `serverless.yml#custom`
- `npm install -g serverless` 
- set up your IAM user for serverless, see [this link](bit.ly/aws-creds-setup)
- `serverless deploy`

That's it. Serverless will tell you where the API endpoints are. Have fun!
