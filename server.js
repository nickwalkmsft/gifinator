var Moniker = require('moniker');
var wget = require('wget-improved');
var util = require('util');
var formidable = require('formidable');
var fs = require('fs');
var http = require('http');
var gm = require('gm');
var magick = gm.subClass({imageMagick: true});

var seconds = 0;

function get_font_size(text) {
  var length = text.length;
  console.log('length =' + length);
  if (length < 18) {
    return 42;
  }
  else if(length < 30) {
    return 26;
  }
  else return 24;
}

// To do:
//   diff file size /tmp/in.gif vs p/out.gif
//   Try to return percent completed
//   We need to be very quick and efficient here
//   since we'll call this once every few seconds
//   while we write to output gif
function get_magick_left(outfile) {
    try {
        setTimeout(function() {
            var stats = fs.statSync('p/' + outfile);
            var fileSizeInBytes = stats.size;
            console.log(fileSizeInBytes);
        }, 1000);
    }
    catch (e) {
        console.error(e);
    }
}

function get_random_name() {
    var name = Moniker.generator([Moniker.adjective, Moniker.noun]);
    return name.choose();
}

function respond_with_expectation_failed(response) {
    console.log('Responding with HTTP 417 Expectation Failed');
    response.writeHead(417, {
        'Content-Type': 'text/plain'
    });
    response.write('HTTP 417 Expectation Failed.\n' +
                   'We could not fetch the gif from the URL you specified.');
    response.end();
}

function fetch_gif(gifurl, infile, response, callback_magick) {
    var options = {};
    try {
        var download = wget.download(gifurl, infile, options);
        download.on('error', function(err) {
            console.log('wget download.on(error) -- ' + err);
            respond_with_expectation_failed(response);
        });
        download.on('start', function(filesize) {
            console.log('Fetching gif to: ' + infile);
            console.log('Download started: ' + filesize);
        });
        download.on('end', function(output) {
            console.log(output);
            callback_magick();
        });
        download.on('progress', function(progress) {
            if (progress == 1) {
                console.log('wget finished: ' + progress);
            }
        });
    }
    catch (e) {
        console.error('wget failed -- catch(e): ' + e);
        respond_with_expectation_failed(response);
    }
}


function do_magick(request, response) {
    var name = get_random_name();
    var infile = '/tmp/' + name;
    console.log('infile set to: ' + infile);
    var outfile = 'p/' + name + '.gif';
    console.log('outfile set to: ' + outfile);
    // Make sure output directory exists
    var outdir = 'p';
    if (!fs.existsSync(outdir)) {
        try {
            fs.mkdirSync(outdir);
        }
        catch (e) {
            console.error('Unable to create output directory: ' + e);
        }

    }
    var form = new formidable.IncomingForm();
    form.parse(request, function (err, fields, files) {
        var gifurl = fields.gifurl || 'http://null'; // wget panics if passed undefined as URL
        var pictext = fields.text;
        console.log('Got text from form: ' + pictext);
        fetch_gif(gifurl, infile, response, function () {
            console.log('Calling imagemagick for ' + pictext);
            console.time('magick_took');
            seconds = (new Date()).getTime()/1000;
            fontsize = get_font_size(pictext);
            console.log('fontsize = ' + fontsize);
            magick(infile)
              .stroke("#000000")
              .fill('#ffffff')
              .font("./impact.ttf", fontsize)
              .dither(false)
              .drawText(0, 0, pictext, 'South')
              .write(outfile, function (err) {
                  if (!err) {
                      console.log('Image processing done.');
                      console.log('outfile: ' + outfile);
                      redirect_to_outfile(response, name);
                  }
                  else console.log(err);
              });
        });
    });
}


function displayForm(response) {
    fs.readFile('form.htm', function (err, data) {
        response.writeHead(200, {
            'Content-Type': 'text/html',
            'Content-Length': data.length
        });
        response.write(data);
        response.end();
    });
}


function redirect_to_outfile(response, name) {
        response.writeHead(302, {
            'Location': '/p/' + name + '.gif'
        });
        response.end();
}


function onRequest(request, response) {
    if (request.method == 'GET' && request.url.match(/^\/p\/.+/)) {
        console.log('request.url = ' + request.url);
        try {
            var img = fs.readFileSync(request.url.replace('/p/', 'p/'));
            console.timeEnd('magick_took');
            response.writeHead(200, {
                'Content-Type': 'image/gif',
                'X-IMAGEMAGICK-TOOK': ((new Date()).getTime()/1000 - seconds).toFixed(2) + ' seconds'
            });
            response.end(img, 'binary');
        }
        catch (e) {
            displayForm(response);
        }
    }
    else if (request.method == 'GET') {
        displayForm(response);
    }
    else if (request.method == 'HEAD') {
        response.writeHead(200);
        response.end();
    }
    else if (request.method == 'POST') {
        console.log('Got POST');
        do_magick(request, response);
    }
    else if (request.method == 'OPTIONS' ||
             request.method == 'PUT' ||
             request.method == 'DELETE' ||
             request.method == 'TRACE' ||
             request.method == 'CONNECT') {
        console.log('We do not know how to handle ' + request.method);
        response.writeHead(501); // Not Implemented
        response.end();
    }
}

http.createServer(onRequest).listen(process.env.PORT || 3000);
console.log('Listening for requests on port ' + (process.env.PORT || 3000));
