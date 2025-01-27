'use strict';

const FormData = require('form-data');
const assert = require('assert');
const axios = require('axios');

process.on('unhandledRejection', () => {});

describe('Express', function() {
  describe('https', function() {
    it('works', async function() {
      const fs = require('fs');
      const https = require('https');

      const app = require('express')();
      app.get('*', (req, res) => res.send('<h1>Hello, World</h1>'));

      const server = https.createServer({
        key: fs.readFileSync(`${__dirname}/localhost-key.pem`, 'utf8'),
        cert: fs.readFileSync(`${__dirname}/localhost.pem`, 'utf8')
      }, app);

      await server.listen(443);
      // acquit:ignore:start
      const res = await axios.get('https://localhost');
      assert.ok(res.data.toString().includes('Hello, World'), res);

      server.close();
      // acquit:ignore:end
    });
  });

  describe('redirects', function() {
    it('basic 302', async function() {
      const app = require('express')();

      // The `res.redirect()` function sends back an HTTP 302 by default.
      // When an HTTP client receives a response with status 302, it will send
      // an HTTP request to the URL in the response, in this case `/to`
      app.get('/from', (req, res) => {
        res.redirect('/to');
      });
      app.get('/to', (req, res) => res.send('Hello, World!'));

      const server = await app.listen(3000);

      const res = await axios.get('http://localhost:3000/from');
      // Axios follows the redirect and sends a GET `/to` request, so the
      // response will contain the string "Hello, World!"
      res.data;
      // acquit:ignore:start
      assert.equal(res.data, 'Hello, World!');
      server.close();
      // acquit:ignore:end
    });

    it('301', async function() {
      const app = require('express')();

      app.get('/from', (req, res) => {
        // The optional first parameter to `res.redirect()` is a numeric
        // HTTP status.
        res.redirect(301, '/to');
      });
      app.get('/to', (req, res) => res.send('Hello, World!'));

      const server = await app.listen(3000);

      const res = await axios.get('http://localhost:3000/from');
      // "Hello, World!"
      res.data;
      // acquit:ignore:start
      assert.equal(res.data, 'Hello, World!');
      server.close();
      // acquit:ignore:end
    });

    it('307', async function() {
      const app = require('express')();
      // Parser to set `req.body`
      app.use(require('body-parser').json());

      app.post('/from', (req, res) => {
        res.redirect(307, '/to');
      });
      app.post('/to', (req, res) => res.send(req.body.message));

      const server = await app.listen(3000);

      const res = await axios.post('http://localhost:3000/from', {
        message: 'Hello, World!'
      });
      // "Hello, World!"
      res.data;
      // acquit:ignore:start
      assert.equal(res.data, 'Hello, World!');
      server.close();
      // acquit:ignore:end
    });
  });

  describe('promises', function() {
    it('promise errors', async function() {
      const app = require('express')();

      app.get(async function routeHandler(req, res) {
        // Will throw an error because `req.params.bar` is undefined
        req.params.bar.toString();

        // Request will hang forever because `res.json()` never gets called.
        res.json({ test: 42 });
      });

      const server = await app.listen(3000);

      // Will time out. If not for the `timeout` option, would hang forever.
      const err = await axios.get('http://localhost:3000', { timeout: 300 }).
        catch(err => err);
      err.message; // "timeout of 300ms exceeded"
      // acquit:ignore:start
      assert.equal(err.message, 'timeout of 300ms exceeded');
      await server.close();
      // acquit:ignore:end
    });

    it('wrapper', async function() {
      const app = require('express')();
      const { addAsync } = require('@awaitjs/express');
      addAsync(app);

      // @awaitjs/express adds a `getAsync()` function to Express
      app.getAsync(async function routeHandler(req, res) {
        // The `getAsync()` function knows to look out for promise rejections
        req.params.bar.toString();

        res.json({ test: 42 });
      });
      // acquit:ignore:start
      // Prevent Express from printing
      app.use(function(error, req, res, next) {
        res.status(500).json({ message: error.message });
      });
      // acquit:ignore:end

      const server = await app.listen(3000);

      const err = await axios.get('http://localhost:3000').
        catch(err => err);
      err.message; // "Request failed with status code 500"
      // acquit:ignore:start
      assert.equal(err.message, 'Request failed with status code 500');
      await server.close();
      // acquit:ignore:end
    });

    it('try/catch', async function() {
      const app = require('express')();

      app.get(async function routeHandler(req, res) {
        // Wrap your route handler logic in a try/catch, and make sure
        // to respond if an unexpected error occurs.
        try {
          req.params.bar.toString();

          res.json({ test: 42 });
        } catch (err) {
          res.status(500).json({ message: err.message });
        }
      });

      const server = await app.listen(3000);

      const err = await axios.get('http://localhost:3000').
        catch(err => err);
      err.message; // "Request failed with status code 500"
      // acquit:ignore:start
      assert.equal(err.message, 'Request failed with status code 500');
      await server.close();
      // acquit:ignore:end
    });

    it('Promise catch', async function() {
      const app = require('express')();

      app.get(function routeHandler(req, res) {
        return Promise.resolve().
          then(() => req.params.bar.toString()).
          then(() => res.json({ test: 42 })).
          // Make sure you call `.catch()` on your promise to handle errors!
          catch(err => res.status(500).json({ message: err.message }));
      });

      const server = await app.listen(3000);

      const err = await axios.get('http://localhost:3000').
        catch(err => err);
      err.message; // "Request failed with status code 500"
      // acquit:ignore:start
      assert.equal(err.message, 'Request failed with status code 500');
      await server.close();
      // acquit:ignore:end
    });
  });

  it('file upload', async function() {
    const app = require('express')();
    const formidable = require('formidable');
    const fs = require('fs');

    app.post('/upload', function(req, res) {
      const form = new formidable.IncomingForm();
      // Parse `req` and upload all associated files
      form.parse(req, function(err, fields, files) {
        if (err != null) {
          return res.json({ message: err.message });
        }

        // The `files` object contains all files that were uploaded. Formidable
        // parses each file and uploads it to a temporary file for you.
        const [firstFileName] = Object.keys(files);

        // The `path` property is where formidable stored the file
        console.log(files[firstFileName].path);

        // You can read the file and print it out.
        fs.readFile(files[firstFileName].path, function(err, content) {
          if (err != null) {
            return res.json({ message: err.message });
          }
          res.json({ content: content.toString('utf8') });
        });
      });
    });

    const server = await app.listen(3000);
    // acquit:ignore:start
    const Writable = require('readable-stream').Writable;
    class ConcatStream extends Writable {
      constructor(cb) {
        super();

        this.on('finish', () => cb(null, this._body));
      }

      _write(chunk, enc, next) {
        if (this._body == null) {
          this._body = '';
        }
        this._body = this._body + chunk.toString();
        next();
      }
    }
    const fd = new FormData();
    fd.append('file.txt', 'Hello World', {
      filename: 'file.txt',
      contentType: 'text/plain',
      knownLength: 'Hello World'.length
    });
    const content = await new Promise(resolve => {
      fd.pipe(new ConcatStream((err, res) => resolve(res)));
    });
    const res = await axios.post('http://localhost:3000/upload', content, {
      headers: fd.getHeaders()
    });

    assert.equal(res.data.content, 'Hello World');
    await server.close();
    // acquit:ignore:end
  });
});