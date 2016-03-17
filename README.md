# Introduction

This project is an Angular2 library for handling secure direct to cloud uploads that are managed by the [Condominios](https://github.com/cotag/Condominios) project.
At CoTag Media we use it to handle all of our file ingestion as it:

* takes the load away from our API servers
* allows us to support hybrid cloud models
* works seamlessly with [AWS Lambda](http://docs.aws.amazon.com/lambda/latest/dg/with-s3.html) and [Google Cloud Functions](https://cloud.google.com/functions/docs)

Effectively this project takes [blob or file objects](https://github.com/cotag/a2-file-drop) in the browser and 

* Manages an upload queue with pause, resume and progress for each upload
* Supports configuring individual upload parallelism and the number of simultaneous uploads
* All files are hashed in webworkers before upload for data integrity
* Communicates with Condominios to obtain [signed requests](http://docs.aws.amazon.com/AmazonS3/latest/dev/RESTAuthentication.html#UsingTemporarySecurityCredentials) for the uploads


## Usage

1. Optionally bootstrap `MD5_WORKER_BASE` - this allows you to customise the path of the [MD5 worker](https://github.com/cotag/ts-md5)
2. Bootstrap the `MD5Workers` - these perform the hashing in webworkers and should only be instansitated once
3. In the components you wish to perform uploads, inject your `Http` service and the `MD5Workers`
4. Import `UploadManager` and the storage providers you wish to use `Amazon`, `Google`, `Azure`, `OpenStack`
5. Add the providers to the upload manager: `UploadManager.addProvider(Amazon);`

You can now use the manager

```typescript

this.manager = new UploadManager(http, '/uploads', workers);
this.manager.autoStart = true;

// ...

// Add files to the upload manager
// Files is an array of Blobs or Files -> https://developer.mozilla.org/en/docs/Web/API/File
this.manager.upload(files);

```


## Building from src

The project is written in typescript and transpiled into ES5.

1. Install TypeScript: `npm install -g typescript` (if you haven't already)
2. Configure compile options in `tsconfig.json`
3. Perform build using: `tsc` or build script below

You can find more information here: https://github.com/Microsoft/TypeScript/wiki/tsconfig.json

## Scripts

1. Build Script: `npm run build`
2. Test Script: `npm run test`


## Publishing

1. Sign up to https://www.npmjs.com/
2. Configure `package.json` https://docs.npmjs.com/files/package.json
3. run `npm publish` https://docs.npmjs.com/cli/publish


# License

MIT
