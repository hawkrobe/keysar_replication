/*  Copyright (c) 2012 Sven "FuzzYspo0N" Bergström, 
                  2013 Robert XD Hawkins
    
    written by : http://underscorediscovery.com
    written for : http://buildnewgames.com/real-time-multiplayer/
    
    modified for collective behavior experiments on Amazon Mechanical Turk

    MIT Licensed.
*/

/* 
   THE FOLLOWING FUNCTIONS MAY NEED TO BE CHANGED
*/

// A window global for our game root variable.
var game = {};
// A window global for our id, which we can use to look ourselves up
var my_id = null;
// Keeps track of whether player is paying attention...
var visible;
var active_keys = []; 
var speed_change = "none";
var started = false;
var ending = false;

// what happens when you press 'left'?
left_turn = function() {
    var self = game.get_player(my_id);
    self.angle = (Number(self.angle) - 5) % 360;
};

// what happens when you press 'left'?
right_turn = function() {
    var self = game.get_player(my_id);
    self.angle = (Number(self.angle) + 5) % 360;
};

client_ondisconnect = function(data) {
    // Redirect to exit survey
    console.log("server booted")
	var URL = 'http://projects.csail.mit.edu/ci/turk/forms/end.html?id=' + my_id;
    window.location.replace(URL);
};


/* 
Note: If you add some new variable to your game that must be shared
  across server and client, add it both here and the server_send_update
  function in game.core.js to make sure it syncs 

Explanation: This function is at the center of the problem of
  networking -- everybody has different INSTANCES of the game. The
  server has its own, and both players have theirs too. This can get
  confusing because the server will update a variable, and the variable
  of the same name won't change in the clients (because they have a
  different instance of it). To make sure everybody's on the same page,
  the server regularly sends news about its variables to the clients so
  that they can update their variables to reflect changes.
*/
client_onserverupdate_received = function(data){

    // Update client versions of variables with data received from
    // server_send_update function in game.core.js
    if(data.players) {
        _.map(_.zip(data.players, game.players),
            function(z){
                z[1].id = z[0].id
                if (z[0].player == null) {
                    z[1].player = null
                } else {
                    var s_player = z[0].player
                    var l_player = z[1].player
                    if(z[0].id != my_id || l_player.angle == null) 
                       l_player.angle = s_player.angle
                   l_player.curr_background = s_player.cbg
                   l_player.total_points = s_player.tot
                   l_player.pos = game.pos(s_player.pos)
                   l_player.speed = s_player.speed
                   l_player.onwall = s_player.onwall
                   l_player.kicked = s_player.kicked
                   l_player.inactive = s_player.inactive
                   l_player.lagging = s_player.lagging
                }
            })
    }
    
    game.game_started = data.gs;
    game.players_threshold = data.pt;
    game.player_count = data.pc;
    game.waiting_remaining = data.wr;

}; 

// This is where clients parse socket.io messages from the server. If
// you want to add another event (labeled 'x', say), just add another
// case here, then call

//          this.instance.player_host.send("s.x. <data>")

// The corresponding function where the server parses messages from
// clients, look for "server_onMessage" in game.server.js.
client_onMessage = function(data) {

    var commands = data.split('.');
    var command = commands[0];
    var subcommand = commands[1] || null;
    var commanddata = commands[2] || null;

    switch(command) {
    case 's': //server message
        switch(subcommand) {    
        case 'end' :
	       // Redirect to exit survey
          console.log("received end message...")
          var URL = 'http://projects.csail.mit.edu/ci/turk/forms/end.html?id=' + my_id;
          window.location.replace(URL); break;
        case 'alert' : // Not in database, so you can't play...
            alert('You did not enter an ID'); 
            window.location.replace('http://nodejs.org'); break;
        case 'join' : //join a game requested
            var num_players = commanddata;
            client_onjoingame(num_players); break;
        case 'add_player' : // New player joined... Need to add them to our list.
            console.log("adding player" + commanddata)
            game.players.push({id: commanddata, player: new game_player(game)}); break;
        case 'begin_game' :
            client_newgame(); break;
        case 'blink' : //blink title
            flashTitle("GO!");  break;
        }        
        break; 
    } 
}; 

// Restarts things on the client side. Necessary for iterated games.
client_newgame = function() {
    // Initiate countdown (with timeouts)
    //game.get_player(my_id).angle = null;
    started = true;
    client_countdown();
}; 

client_countdown = function() {
    var player = game.get_player(my_id);
    player.message = 'Begin in 3...';
    setTimeout(function(){player.message = 'Begin in 2...';}, 
               1000);
    setTimeout(function(){player.message = 'Begin in 1...';}, 
               2000);
    setTimeout(function(){
        player.message = 'GO!';     
        game.start_time = new Date();}, 
	3000);
    setTimeout(function(){player.message = '';}, 
               4000);
}

client_update = function() {
    var player = game.get_player(my_id);

    //Clear the screen area
    game.ctx.clearRect(0,0,485,280);

    // Alter speeds
    if (speed_change != "none") {
        player.speed = speed_change == "up" ? game.max_speed : game.min_speed;
        game.socket.send("s." + String(player.speed).replace(/\./g,'-'));
        speed_change = "none"
    }

    // Turn if key is still being held... Don't do anything if both are held
    if (active_keys.length == 1) {
        if(_.contains(active_keys, 'right')) right_turn();
        if(_.contains(active_keys, 'left')) left_turn() ;
    }

    //Draw opponent next 
    _.map(game.get_others(my_id), function(p){
        draw_player(game, p.player)
	draw_label(game, p.player, "Player " + p.id.slice(0,4))
    })

    // Draw points scoreboard 
    $("#cumulative_bonus").html("Total bonus so far: $" + (player.total_points).fixed(2));

    onwall = player.onwall;
    if(onwall) {
	$("#curr_bonus").html("Current Score: <span style='color: red;'>0%</span>");
    } else {
	if(game.game_started) {
	    $("#curr_bonus").html("Current Score: <span style='color: " 
				  + getColorForPercentage(player.curr_background) 
				  +";'>" + Math.floor(player.curr_background*100) + "%</span>");
	} else {
	    $("#curr_bonus").html("Current Score: <span style='color: " 
				  + getColorForPercentage(0) 
				  +";'>---</span>");	
	}
    }
    
    if(!started) {
	var left = timeRemaining(game.waiting_remaining, game.waiting_room_limit)
	var diff = game.players_threshold - game.player_count
	//game.get_player(my_id).message = 'Waiting for ' + diff + ' more players or ' + left['t'] + ' more ' + left['unit'] + '.';
    }
    
    if(game.game_started) {
	var left = new Date() - game.start_time;
	if((game.round_length*60 - Math.floor(left/1000)) < 6) {
	    var remainder = game.round_length*60 - Math.floor(left/1000);
	    if(remainder < 0) 
		remainder = 0
	    player.message = 'Ending in ' + remainder;
	}
	left = timeRemaining(left, game.round_length);
	// Draw time remaining 
	$("#time").html("Time remaining: " + left['t'] + " " + left['unit']);
    } else {
	$("#time").html('You are in the waiting room.');
    }
    
    //And then we draw ourself so we're always in front
    if(player.pos) {
	draw_player(game, player)
	draw_label(game, player, "YOU");
    }

};

var timeRemaining = function(remaining, limit) {
    var time_remaining = limit - Math.floor(remaining / (1000*60));
    if(time_remaining > 1) {
	return {t: time_remaining, unit: 'minutes', actual: (limit - remaining/1000)}
    } else {
	time_remaining = limit - Math.floor(remaining / (1000 * 60)*6)/6
	time_remaining = Math.max(Math.floor(time_remaining*6)*10, 10)
	return {t: time_remaining, unit: 'seconds', actual: (limit - remaining/1000)}
    }

}

var percentColors = [
//    { pct: 0.0, color: { r: 0xff, g: 0x00, b: 0 } },
    { pct: 0.0, color: { r: 0xff, g: 0xff, b: 0xff } },
    { pct: 1.0, color: { r: 0x00, g: 0xff, b: 0 } } ];
 
var getColorForPercentage = function(pct) {
    for (var i = 0; i < percentColors.length; i++) {
        if (pct <= percentColors[i].pct) {
            var lower = percentColors[i - 1] || { pct: 0.1, color: { r: 0x0, g: 0x00, b: 0 } };
            var upper = percentColors[i];
            var range = upper.pct - lower.pct;
            var rangePct = (pct - lower.pct) / range;
            var pctLower = 1 - rangePct;
            var pctUpper = rangePct;
            var color = {
                r: Math.floor(lower.color.r * pctLower + upper.color.r * pctUpper),
                g: Math.floor(lower.color.g * pctLower + upper.color.g * pctUpper),
                b: Math.floor(lower.color.b * pctLower + upper.color.b * pctUpper)
            };
            return 'rgb(' + [color.r, color.g, color.b].join(',') + ')';
        }
    }
}

/*
  The following code should NOT need to be changed
*/

// When loading the page, we store references to our
// drawing canvases, and initiate a game instance.
window.onload = function(){
    //Create our game client instance.
    game = new game_core();
    
    //Connect to the socket.io server!
    client_connect_to_server(game);
    
    //Fetch the viewport
    game.viewport = document.getElementById('viewport');
    
    //Adjust its size
    game.viewport.width = game.world.width;
    game.viewport.height = game.world.height;

    // Keep track of which keys are being pressed. Keys fire continuously while held.
    KeyboardJS.on('left', 
	function(){ // Only notify on FIRST press
	    if(!_.contains(active_keys, 'left')) {
		active_keys.push('left');
	    }
	},
	function(){ // Only notify on first release
	    if(_.contains(active_keys, 'left')) {
		game.socket.send('a.' + game.get_player(my_id).angle)
	    }
	    active_keys = _.without(active_keys, 'left');});
    KeyboardJS.on('right', 
        function(){ // Only notify on first press
	    if(!_.contains(active_keys, 'right')) {
		active_keys.push('right');
	    }
	}, 
        function(){ // Only notify on first release
	    if(_.contains(active_keys, 'right')) {
		game.socket.send('a.' + game.get_player(my_id).angle)
	    }
	    active_keys = _.without(active_keys, 'right');})
    KeyboardJS.on('space', 
        function(){speed_change = "up"}, 
        function(){speed_change = "down"})


    //Fetch the rendering contexts
    game.ctx = game.viewport.getContext('2d');

    //Set the draw style for the font
    game.ctx.font = '11px "Helvetica"';

    //Finally, start the loop
    game.update();
};

// Associates callback functions corresponding to different socket messages
client_connect_to_server = function(game) {
    //Store a local reference to our connection to the server

    game.socket = io.connect();

    $('form').submit(function(){
        var msg = 'chatMessage.' + $('#chatbox').val();
        game.socket.send(msg);
        $('#chatbox').val('');
        return false;
    });
    game.socket.on('chatMessage', function(data){
        var source = data.user === my_id ? "You" : "Your partner"
        $('#messages').append($('<li>').text(source + ":" + data.msg));
        $('#messages').stop().animate({
            scrollTop: $("#messages")[0].scrollHeight
        }, 800);
    })


    //When we connect, we are not 'connected' until we have a server id
    //and are placed in a game by the server. The server sends us a message for that.
    game.socket.on('connect', function(){}.bind(game));


    game.socket.on('ping', function(data){
	    game.socket.send('pong.' + data.sendTime + "." + data.tick_num)})
    //Sent when we are disconnected (network, server down, etc)
    game.socket.on('disconnect', client_ondisconnect.bind(game));
    //Sent each tick of the server simulation. This is our authoritive update
    game.socket.on('onserverupdate', client_onserverupdate_received);
    //Handle when we connect to the server, showing state and storing id's.
    game.socket.on('onconnected', client_onconnected.bind(game));
    //On message from the server, we parse the commands and send it to the handlers
    game.socket.on('message', client_onMessage.bind(game));
}; 

client_onconnected = function(data) {
    //The server responded that we are now in a game,
    //this lets us store the information about ourselves  
    // so that we remember who we are.  
    my_id = data.id;
    game.players[0].id = my_id;
    game.get_player(my_id).online = true;
};

client_onjoingame = function(num_players) {
    // Need client to know how many players there are, so they can set up the appropriate data structure
    _.map(_.range(num_players - 1), function(i){game.players.unshift({id: null, player: new game_player(game)})});
    // Set self color, leave others default white
    game.get_player(my_id).color = game.self_color;
    // Start 'em moving
    game.get_player(my_id).speed = game.min_speed;
    game.get_player(my_id).message = 'Please remain active while you wait.';
}; 

// Automatically registers whether user has switched tabs...
(function() {
    document.hidden = hidden = "hidden";

    // Standards:
    if (hidden in document)
        document.addEventListener("visibilitychange", onchange);
    else if ((hidden = "mozHidden") in document)
        document.addEventListener("mozvisibilitychange", onchange);
    else if ((hidden = "webkitHidden") in document)
        document.addEventListener("webkitvisibilitychange", onchange);
    else if ((hidden = "msHidden") in document)
        document.addEventListener("msvisibilitychange", onchange);
    // IE 9 and lower:
    else if ('onfocusin' in document)
        document.onfocusin = document.onfocusout = onchange;
    // All others:
    else
        window.onpageshow = window.onpagehide = window.onfocus 
             = window.onblur = onchange;
})();

function onchange (evt) {
    var v = 'visible', h = 'hidden',
    evtMap = { 
        focus:v, focusin:v, pageshow:v, blur:h, focusout:h, pagehide:h 
    };
    evt = evt || window.event;
    if (evt.type in evtMap) {
        document.body.className = evtMap[evt.type];
    } else {
        document.body.className = evt.target.hidden ? "hidden" : "visible";
    }
    visible = document.body.className;
    game.socket.send("h." + document.body.className);
};

// Flashes title to notify user that game has started
(function () {

    var original = document.title;
    var timeout;

    window.flashTitle = function (newMsg, howManyTimes) {
        function step() {
            document.title = (document.title == original) ? newMsg : original;
            if (visible == "hidden") {
                timeout = setTimeout(step, 500);
            } else {
                document.title = original;
            }
        };
        cancelFlashTitle(timeout);
        step();
    };

window.cancelFlashTitle = function (timeout) {
    clearTimeout(timeout);
    document.title = original;
};

}());
