/* jshint node: true  */
'use strict';

// todo: this currently only works if the deployed revision is the latest revision

var util = require('util');
var path = require('path');
var async = require('async');
var fs = require('fs');
var _ = require('underscore');

var defaults = require('../defaults');
var listdeployments = require('./listdeployments');

/* From python apigeetool:

 Usage: undeploy -o [organization] -n [proxy name]
 -r [revision] -e [environment]
 -u [username] -p [password]
 -l [Apigee URL]

 -o Apigee organization name
 -n Apigee proxy name
 -e Apigee environment name (optional, see below)
 -r Revision to undeploy (optional, see below)
 -u Apigee user name
 -p Apigee password
 -l Apigee API URL (optional, defaults to https://api.enterprise.apigee.com)
 -h Print this message

 To undeploy all revisions of the proxy in all environments, use -n
 To undeploy a specific revision in all environments, use -r and -n
 To undeploy all revisions in a specific environment, use -n and -e
 Use all three to undeploy a specific revision in a specific environment
 */

module.exports.descriptor = defaults.defaultDescriptor({
  api: {
    name: 'API Name',
    shortOption: 'n',
    required: true
  },
  environment: {
    name: 'Environment',
    shortOption: 'e',
    required: true
  },
  revision: {
    name: 'Revision',
    shortOption: 'r',
    required: false
  }
});

module.exports.run = function(opts, cb) {
  defaults.defaultOptions(opts);
  if (opts.debug) {
    console.log('undeploy: %j', opts);
  }

  var request = defaults.defaultRequest(opts);

  // Run each function in series, and collect an array of results.
  async.series([
    function(done) {
      getDeploymentInfo(opts, request, done);
    },
    function(done) {
      undeploy(opts, request, done);
    },
    function(done) {
      displayStatus(opts, request, done);
    }
    ],
    function(err, results) {
      if (err) {
        cb(err);
      } else {
        if (opts.debug) {
          console.log('results: %j', results);
        }
        cb(undefined, results[results.length - 1]);
      }
    });
};

function getDeploymentInfo(opts, request, done) {

  // Find out which revision we should be undeploying
  request.get(util.format('%s/v1/o/%s/apis/%s',
               opts.baseuri, opts.organization, opts.api),
  function(err, req, body) {
      if (err) {
        done(err);
      } else if (req.statusCode === 404) {
        if (opts.verbose) {
          console.log('API %s does not exist.', opts.api);
        }
        done();
      } else if (req.statusCode === 200) {
        opts.deploymentVersion =
          parseInt(_.max(body.revision, function(r) { return parseInt(r); })) + 1;
        if (opts.verbose) {
          console.log('Going to undeploy revision %d of API %s',
                      opts.deploymentVersion, opts.api);
        }
        done();
      } else {
        done(new Error(util.format('Get API info returned status %d', req.statusCode)));
      }
  });
}

function undeploy(opts, request, done) {
  if (opts.verbose) {
    console.log('Undeploying revision %d of %s to %s', opts.deploymentVersion,
                opts.api, opts.environment);
  }
  var uri = util.format('%s/v1/o/%s/e/%s/apis/%s/revisions/%d/deployments',
              opts.baseuri, opts.organization, opts.environment, opts.api,
              opts.deploymentVersion);
  if (opts.debug) {
    console.log('Going to send DELETE to %s', uri);
  }

  request({
    uri: uri,
    method: 'DELETE',
    json: false,
    headers: { 'Content-Type': 'application/x-www-form-urlencoded',
               'Accept': 'application/json' }
  }, function(err, req, body) {
    if (err) {
      done(err);
    } else if (req.statusCode === 200) {
      if (opts.verbose) {
        console.log('Undeployment successful');
      }
      if (opts.debug) {
        console.log('%s', body);
      }
      done();
    } else {
      if (opts.verbose) {
        console.error('Undeployment result: %j', body);
      }
      var jsonBody = JSON.parse(body);
      var errMsg;
      if (jsonBody && (jsonBody.message)) {
        errMsg = jsonBody.message;
      } else {
        errMsg = util.format('Undeployment failed with status code %d',
                   req.statusCode);
      }
      done(new Error(errMsg));
    }
  });
}

function displayStatus(opts, request, done) {
  if (opts.verbose) {
    console.log('Checking deployment status');
  }
  var deployOpts = {
    organization: opts.organization,
    api: opts.api,
    username: opts.username,
    password:  opts.password,
    verbose: opts.verbose,
    debug: opts.debug
  };
  listdeployments.run(deployOpts, done);
}