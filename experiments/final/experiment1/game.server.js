/*  Copyright (c) 2012 Sven "FuzzYspo0N" Bergström, 2013 Robert XD Hawkins
    
    written by : http://underscorediscovery.com
    written for : http://buildnewgames.com/real-time-multiplayer/
    
    modified for collective behavior experiments on Amazon Mechanical Turk

    MIT Licensed.
*/

//require('look').start()

var utils       = require('../sharedUtils/sharedUtils.js'),
    fs          = require('fs');
	    
var moveObject = function(client, i, x, y) {
  var obj = client.game.objects[i];
  var others = client.game.get_others(client.userid);
  obj.trueX = parseInt(x);
  obj.trueY = parseInt(y);
  _.map(others, function(p) {
    p.player.instance.emit('objMove', {i: i, x: x, y: y});
  });
};

var onMessage = function(client,message) {
  //Cut the message up into sub components
  var message_parts = message.split('.');

  //The first is always the type of message
  var message_type = message_parts[0];

  //Extract important variables
  var all = client.game.get_active_players();
  var target = client.game.get_player(client.userid);
  var others = client.game.get_others(client.userid);
  switch(message_type) {
  case 'objMove' :    // Client is changing angle
    moveObject(client, message_parts[1], message_parts[2], message_parts[3]);
    break;

  case 'drop' :
    var type = message_parts[1];
    moveObject(client, message_parts[2], message_parts[3], message_parts[4]);
    var extraData = message_parts[5] + '.' + message_parts[6];
    if(type == 'correct') {
      client.game.attemptNum = 0;
      _.map(all, function(p) {
	p.player.instance.send("s.feedback.correct." + extraData);});
    } else {
      client.game.attemptNum += 1;
      _.map(all, function(p) {p.player.instance.send("s.feedback.incorrect." + extraData);});
      client.game.instructionNum -= 1;
    }
    setTimeout(() => client.game.newRound(), 3000);
    break;

  case 'chatMessage' :
    // Update others
    var msg = message_parts[1].replace(/-/g,'.');
    _.map(all, function(p){
      p.player.instance.emit( 'chatMessage', {user: client.userid, msg: msg});
    });
    break;

  case 'updateMouse' :
    break;

  case 'h' : // Receive message when browser focus shifts
    target.visible = message_parts[1];
    break;
  }
};

var dataOutput = function() {
  function commonOutput (client, message_data) {
    var objectName = client.game.instructions[client.game.instructionNum].split(' ')[0];
    var object = _.find(client.game.objects, obj => obj.name == objectName);

    return {
      iterationName: client.game.iterationName,
      gameid: client.game.id,
      time: Date.now(),
      condition: client.game.condition,
      trialNum : client.game.roundNum + 1,
      instructionNum : client.game.instructionNum,      
      workerId: client.workerid,
      assignmentId: client.assignmentid,
      targetObject: objectName,
      attemptNum : client.game.attemptNum,
      trialType : client.game.trialList[client.game.roundNum].condition,
      objectSet : client.game.trialList[client.game.roundNum].objectSet,
      critical: object.critical === "filler" ? false : true
    };
  };

  var mouseOutput = function(client, messageData) {
    var common = commonOutput(client, messageData);
    var critical = _.find(client.game.objects, obj => obj.critical == "distractor");
    var object = _.find(client.game.objects, obj => obj.name == common.targetObject);
    var mouse = {x: messageData[2], y : messageData[3]};
    var target = {x: object.upperLeftX + object.width/2, y: object.upperLeftY + object.height/2};
    var distractor = !common.critical ? 'none' : {
      x: critical.upperLeftX + critical.width/2, y: critical.upperLeftY + critical.height/2
    };

    var targetDistance = Math.floor(Math.sqrt(
      Math.pow(mouse.x - target.x, 2) + Math.pow(mouse.y - target.y, 2)
    ));

    var distractorDistance = !critical ? 'none' : Math.floor(Math.sqrt(
      Math.pow(mouse.x - distractor.x, 2) + Math.pow(mouse.y - distractor.y, 2)
    ));

    return _.extend({}, common, {
      targetDistance, distractorDistance,
      localTime: messageData[1],
      rawMouseX : mouse.x,
      rawMouseY : mouse.y
    });
  };

  var messageOutput = function(client, messageData) {
    return _.extend({}, commonOutput(client, messageData), {
      sender: client.role,
      contents : messageData[1].replace(/-/g,'.')
    });
  };

  var errorOutput = function(client, messageData) {
    return _.extend({}, commonOutput(client, messageData), {
      attemptedObject : client.game.objects[messageData[1]].name,
      intendedX : client.game.currentDestination[0],
      intendedY : client.game.currentDestination[1],
      attemptedX : messageData[4],
      attemptedY : messageData[5]
    });
  };
  
  return {
    'updateMouse' : mouseOutput,
    'chatMessage' : messageOutput,
    'incorrectDrop' : errorOutput
  };
}();

module.exports = {
  onMessage : onMessage,
  dataOutput: dataOutput
};
