/**
* @Author: Alex Sorafumo <alex.sorafumo>
* @Date:   19/10/2016 10:47 AM
* @Email:  alex@yuion.net
* @Filename: clean.js
* @Last modified by:   alex.sorafumo
* @Last modified time: 25/01/2017 8:12 AM
*/

var gulp = require('gulp');
var config = require('../config')();
var del = require('del');

/* Run all clean tasks */
gulp.task('clean', ['clean:dist', 'clean:build']);

gulp.task('clean:build', function() {
    return del([
        '_build'
    ]);
});

gulp.task('clean:dist', function() {
    return del([
        'dist'
    ]);
});
