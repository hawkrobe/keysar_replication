/*  Copyright (c) 2012 Sven "FuzzYspo0N" Bergström, 2013 Robert XD Hawkins

    written by : http://underscorediscovery.com
    written for : http://buildnewgames.com/real-time-multiplayer/

    modified for collective behavior experiments on Amazon Mechanical Turk

    MIT Licensed.
*/
    var
        fs    = require('fs'),
        utils = require(__base + '/sharedUtils/sharedUtils.js');

// This is the function where the server parses and acts on messages
// sent from 'clients' aka the browsers of people playing the
// game. For example, if someone clicks on the map, they send a packet
// to the server (check the client_on_click function in game.client.js)
// with the coordinates of the click, which this function reads and
// applies.
var onMessage = function(client,message) {
  //Cut the message up into sub components
  var message_parts = message.split('.');

  //The first is always the type of message
  var message_type = message_parts[0];

  //Extract important variables
  var gc = client.game;
  var id = gc.id;
  var all = gc.get_active_players();
  var target = gc.get_player(client.userid);
  var others = gc.get_others(client.userid);
  switch(message_type) {

  case 'postTest_word' :
    console.log('received word post test message');
    break;

  case 'postTest_object' :
    console.log('received object post test message');
    break;

  case 'chatMessage' :
    if(client.game.player_count == 2 && !gc.paused) {
      var msg = message_parts[1].replace(/~~~/g,'.');
      _.map(all, function(p){
	p.player.instance.emit( 'chatMessage', {user: client.userid, msg: msg});});
    }
    break;
    
  case 'clickedObj' :
    // Write event to file
    others[0].player.instance.send('s.feedback.' + message_parts[1]);
    target.instance.send('s.feedback.' + message_parts[1]);

    // Continue
    gc.newRound(5000);
    break;

  case 'playerTyping' :
    _.map(others, function(p) {
      p.player.instance.emit( 'playerTyping', {typing: message_parts[1]});
    });
    break;

  case 'h' : // Receive message when browser focus shifts
    target.visible = message_parts[1];
    break;
  }
};

/*
  Associates events in onMessage with callback returning json to be saved
  {
    <eventName>: (client, message_parts) => {<datajson>}
  }
  Note: If no function provided for an event, no data will be written
*/
var dataOutput = function() {
  function getIntendedTargetName(objects) {
    return _.filter(objects, o => o.targetStatus === 'target')[0]['name'];
  }

  function getObjectLocs(objects) {
    return _.flatten(_.map(objects, o => {
      return [o.name, o.gridX, o.gridY];
    }));
  }

  function getObjectLocHeaderArray() {
    return _.flatten(_.map(_.range(1,5), i => {
      return _.map(['name', 'gridX', 'gridY'], v => {
	return 'object' + i + v;
      });
    }));
  };
  
  function commonOutput (client, message_data) {
    return {
      iterationName: client.game.iterationName,
      gameid: client.game.id,
      time: Date.now(),
      workerId: client.workerid,
      assignmentId: client.assignmentid
    };
  };
  
  var clickedObjOutput = function(client, message_data) {
    var objects = client.game.trialInfo.currStim.objects;
    var intendedName = getIntendedTargetName(objects);
    var objLocations = _.zipObject(getObjectLocHeaderArray(), getObjectLocs(objects));
    return _.extend(
      commonOutput(client, message_data),
      client.game.trialInfo.currContextType,
      objLocations, {
	intendedName,
	clickedName: message_data[1],
	trialNum : client.game.state.roundNum + 1,	
	correct: intendedName === message_data[1],
	condition: client.game.condition
      }
    );
  };

  var messageOutput = function(client, message_data) {
    var intendedName = getIntendedTargetName(client.game.trialInfo.currStim.objects);
    return _.extend(
      client.game.trialInfo.currStim.currContextType,
      commonOutput(client, message_data), {
	intendedName,
	trialNum : client.game.state.roundNum + 1,	
	text: message_data[1].replace(/~~~/g, '.'),
	role: client.role,
	timeFromRoundStart: message_data[2]
      }
    );
  };

  return {
    'chatMessage' : messageOutput,
    'clickedObj' : clickedObjOutput
  };
}();

module.exports = {dataOutput, onMessage};
