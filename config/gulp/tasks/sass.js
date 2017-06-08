/**
* @Author: Alex Sorafumo <alex.sorafumo>
* @Date:   19/10/2016 10:47 AM
* @Email:  alex@yuion.net
* @Filename: sass.js
* @Last modified by:   alex.sorafumo
* @Last modified time: 25/01/2017 8:12 AM
*/

'use strict';

var gulp = require('gulp');
var sass = require('gulp-sass');
const autoprefixer = require('gulp-autoprefixer');

gulp.task('sass', ['source'], function () {
    return gulp.src('./src/**/*.scss')
        .pipe(sass({outputStyle: 'compressed', includePaths: ['./src/app/shared/']}).on('error', sass.logError))
        .pipe(autoprefixer({
            browsers: ['last 3 versions'],
            cascade: false
        }))
        .pipe(gulp.dest('./_build'));
});


gulp.task('sass:dev', function () {
    return gulp.src('./src/**/*.scss')
        .pipe(sass({outputStyle: 'compressed', includePaths: ['./src/app/shared/']}).on('error', sass.logError))
        .pipe(autoprefixer({
            browsers: ['last 3 versions'],
            cascade: false
        }))
        .pipe(gulp.dest('./_build'));
});
