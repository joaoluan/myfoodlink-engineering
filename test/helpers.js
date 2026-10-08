'use strict';

function createResponse() {
  return {
    statusCode: null,
    body: null,
    headersSent: false,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(body) {
      this.body = body;
      this.headersSent = true;
      return this;
    },
    sendStatus(code) {
      this.statusCode = code;
      this.headersSent = true;
      return this;
    }
  };
}

const silentLogger = { info: () => {}, error: () => {} };

module.exports = { createResponse, silentLogger };
