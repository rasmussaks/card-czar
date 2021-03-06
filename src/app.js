var express = require('express');
var path = require('path');
var logger = require('morgan');
var cookieParser = require('cookie-parser');
var bodyParser = require('body-parser');
var flash = require('connect-flash');
var session = require('express-session');
var compression = require('compression');
var stylus = require('stylus');
var nib = require('nib');
var models = require('./models');
var env = global.env = process.env.NODE_ENV || 'development';
var config = require('./config/config.json')[env];
var sequelize = models.sequelize;
var passport = require('passport');
var fs = require('fs');
var SequelizeStore = require('connect-session-sequelize')(session.Store);


sequelize.authenticate().then(function () {
  console.log("Connected to MySQL");
  //Force sync schema
  return sequelize.query('SET FOREIGN_KEY_CHECKS = 0', {raw: true}).then(function () {
    return sequelize.sync({force: false});
  });
}).then(function () {
  models.Deck.count().then(function (c) {
    if (c == 1) return;
    models.Deck.create({
      name: "Base Game"
    }).then(function (deck) {
      //These are provided by CAH themselves
      var white = fs.readFileSync("./src/config/wcards.txt", "utf8").split("<>");
      var black = fs.readFileSync("./src/config/bcards.txt", "utf8").split("<>");
      for (var i = 0; i < white.length; i++) {
        var w = white[i];
        //Raw INSERT query because we have to..
        sequelize.query("INSERT INTO Cards (text, isBlack, chooseNum, createdAt, updatedAt, DeckId) VALUES(?, false, 0, NOW(), NOW(), ?)", {replacements: [w, deck.id]});
      }
      for (var j = 0; j < black.length; j++) {
        var b = black[j];
        var chooseNum;
        if (b.indexOf("superhero/sidekick duo") !== -1) chooseNum = 2;
        else chooseNum = (b.match(/__________/g) || [1]).length;
        deck.createCard({
          text: b,
          isBlack: true,
          chooseNum: chooseNum
        });
      }
    });
  });
});

var app = express();

app.set('views', path.join(__dirname, '../views'));
app.set('view engine', 'jade');
app.use(logger(env == 'production' ? 'common' : 'dev'));
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({extended: false}));
app.use(cookieParser());
app.use(compression());
if (config.baseUrl.indexOf("localhost") != -1) {
  var bs = require('browser-sync').create();
  bs.init(
    {
      logSnippet: false,
      files: ["public/css/*.styl", "views/*.jade", "public/js/*.js"],
      ghostMode: false
    }
  );
  app.use(require('connect-browser-sync')(bs));
}
app.use(stylus.middleware({
  src: path.join(__dirname, '../public/css'),
  compress: true,
  compile: function (str, path) {
    return stylus(str)
      .set('filename', path)
      .set('compress', true)
      .use(nib());
  }
}));

app.use("/js/combined.js", function(req, res) {
  var files=["bower_components/bootstrap/dist/js/bootstrap.min.js",
    "bower_components/angular/angular.min.js",
    "public/js/app.js",
    "public/js/filters.js",
    "public/js/services.js",
    "bower_components/angular-resource/angular-resource.min.js"
  ];
  var txt = "";
  for (var i = 0; i < files.length; i++) {
    var f = files[i];
    txt += fs.readFileSync(f);
  }
  res.set("Content-Type", "application/javascript");
  res.send(txt);
});
app.use(express.static(path.join(__dirname, '../public'), {
  maxage: "7 days"
}));
app.use("/bower_components", express.static(path.join(__dirname, '../bower_components'), {
  maxage: "7 days"
}));
app.use(flash());
var store = new SequelizeStore({
  db: sequelize
});
var sessionMiddleware = session({
  saveUninitialized: false,
  resave: false,
  secret: 'x9fgj9aoi8848w0kokc08ws0s',
  store: store
});
app.use(sessionMiddleware);

app.use(passport.initialize());
app.use(passport.session());

//Initialize passport strategies
require("./app/passport.js")(passport);

app.use(function (req, res, next) {
  console.log(req.originalUrl);
  res.locals.req = req;
  //Get language file
  if (req.query.lang) {
    try {
      console.log("./locale/" + req.query.lang + ".json");
      res.locals.lang = require("./locale/" + req.query.lang + ".json");
      console.log("./locale/" + req.query.lang + ".json");
      res.locals.nextLang = req.query.lang == "en" ? "af" : "en";
      next();
      return;
    } catch (ignored) {
      //eslint-disable no-empty
    }
  }
  res.locals.lang = require("./locale/en.json");
  //Load into jade
  res.locals.nextLang = "af";
  next();
});

app.use("/game", require("./routes/game"));
app.use("/auth", require("./routes/auth"));
app.use("/api", require("./routes/api"));
app.use("/deckbrowser", require("./routes/deckbrowser"));
app.use("/bank", require("./routes/bank"));
app.use("/", require("./routes/index"));


var port = process.env.PORT || '8081';
global.io = require("./app/socket")({
  server: app.listen(port),
  session: sessionMiddleware,
  store: store
});


try {
  var privateKey = fs.readFileSync('cert/server.key', 'utf8');
  var certificate = fs.readFileSync('cert/server.crt', 'utf8');
  var credentials = {key: privateKey, cert: certificate};

} catch (ex) {
  console.log("Could not find certs");
}
if (credentials) {
  var https = require('https'),
    utillib = require('util');

  var options = {
    key: credentials.key,
    cert: credentials.cert,
    requestCert: true
  };
  https.createServer(options, function (req, res) {
    console.log(req);
    res.setHeader("Content-type", "text/plain; charset=utf-8");
    res.writeHead(200);
    res.end(utillib.inspect(req.connection.getPeerCertificate()));
  }).listen(8083);
}


module.exports = app;
