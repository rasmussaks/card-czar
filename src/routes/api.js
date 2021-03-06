var express = require('express');
var router = express.Router();
var models = require("../models");

router.use(function (req, res, next) {
  res.success = function (data) {
    if (typeof data === 'object') {
      res.json(data);
      return;
    }
    res.json({
      data: data
    });
  };
  res.fail = function (err) {
    res.json({
      error: err.toString()
    });
  };
  next();
});
router.get("/user", function (req, res) {
  res.success(req.user);
});
router.get("/users", function (req, res) {
  //Raw COUNT(*) query because we have to..
  models.sequelize.query("SELECT COUNT(*) AS c FROM Users").then(function (count) {
    res.success(count[0][0].c);
  }).catch(function (err) {
    res.fail(err);
  });
});

router.get("/totalgames", function (req, res) {
  models.Game.count().then(function (count) {
    res.success(count);
  }).catch(function (err) {
    res.fail(err);
  });
});

router.get("/decks", function (req, res) {
  models.Deck.findAll().then(function (decks) {
    res.success(decks);
  }).catch(function (err) {
    res.fail(err);
  });
});

router.get("/cards", function (req, res) {
  if (req.query.deck === undefined) {
    res.fail("Missing deck ID");
    return;
  }
  models.Deck.findById(req.query.deck, {include: [models.Card]}).then(function (deck) {
    if (!deck) {
      res.fail("No deck with ID " + req.query.deck);
      return;
    }
    return deck.getCards().then(function (cards) {
      res.success(cards);
    });
  }).catch(function (err) {
    res.fail(err);
  });
});

router.get("/allCards", function (req, res) {
  //Raw JOIN query because we have to..
  models.sequelize.query("SELECT Cards.id, isBlack, chooseNum, text, name, DeckId FROM Cards JOIN Decks ON Cards.DeckId = Decks.id", { type: models.sequelize.QueryTypes.SELECT}).then(function(cards) {
    for (var i = 0; i < cards.length; i++) {
      var c = cards[i];
      c.isBlack = !!c.isBlack;//Convert to boolean...
    }
    res.success(cards);
  }).catch(function (err) {
    res.fail(err);
  });
});

module.exports = router;
