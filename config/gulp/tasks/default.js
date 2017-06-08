/**
* @Author: Alex Sorafumo <alex.sorafumo>
* @Date:   19/10/2016 10:47 AM
* @Email:  alex@yuion.net
* @Filename: default.js
* @Last modified by:   alex.sorafumo
* @Last modified time: 25/01/2017 8:12 AM
*/

'use strict';

var gulp = require('gulp');
var del = require('del');
var exec = require('child_process').exec;
var clean = require('gulp-clean');

gulp.task('build',      ['webpack:dev']);
gulp.task('build:dev',  ['webpack:dev']);
gulp.task('build:prod', ['webpack:prod']);
gulp.task('test',       ['webpack:test']);
gulp.task('build:test', ['webpack:test']);

gulp.task('source', ['clean'], function () {
    return gulp.src(['./src/**', '!./src/**/*.scss'])
        .pipe(gulp.dest('./_build'));
});
gulp.task('source:dev', function () {
    return gulp.src(['./src/**', '!./src/**/*.scss'])
        .pipe(gulp.dest('./_build'));
});

gulp.task('dev:watch', function () {
    gulp.watch('./src/**', ['source:dev']);
    gulp.watch('./src/**/*.scss', ['sass:dev']);
});

gulp.task('ngc', ['inject:css+html'], function (cb) {
    return exec('./node_modules/.bin/ngc -p ./tsconfig.aot.json', function (err, stdout, stderr) {
        del(['./dist/**/*.ts']);
        return cb(err);
    });
});

var Server = require('karma').Server;

/**
 * Run test once and exit
 */
gulp.task('test', ['source', 'sass'], function (done) {
  new Server({
    configFile: path.join(__dirname, '/../../../karma.conf.js')
  }, done).start();
});
