/*  Copyright (c) 2012 Sven "FuzzYspo0N" Bergström, 
                  2013 Robert XD Hawkins
    
    written by : http://underscorediscovery.com
    written for : http://buildnewgames.com/real-time-multiplayer/
    
    substantially modified for collective behavior experiments on the web

    MIT Licensed.
*/

/*
  The main game class. This gets created on both server and
  client. Server creates one for each game that is hosted, and each
  client creates one for itself to play the game. When you set a
  variable, remember that it's only set in that instance.
*/
var has_require = typeof require !== 'undefined'

if( typeof _ === 'undefined' ) {
    if( has_require ) {
        _ = require('underscore')
    }
    else throw new Error('mymodule requires underscore, see http://underscorejs.org');
}

var game_core = function(game_instance){

    this.debug = false

    // Define some variables specific to our game to avoid
    // 'magic numbers' elsewhere
    this.self_color = '#2288cc';
    this.other_color = 'white';
    
    //Store the instance, if any (passed from game.server.js)
    this.instance = game_instance;

    //Store a flag if we are the server instance
    this.server = this.instance !== undefined;

    //Dimensions of world -- Used in collision detection, etc.
    this.world = {width : 485, height : 280};  // 160cm * 3

    //How often the players move forward <global_speed>px in ms.
    this.tick_frequency = 125;     //Update 8 times per second
    this.ticks_per_sec = 1000/125

    if(this.debug) {
	this.waiting_room_limit = 0.5 // set maximum waiting room time (in minutes)
	this.round_length = 0.5; // set how long each round will last (in minutes)
	this.max_bonus = 1.25*6/this.round_length; // total $ players can make in bonuses 
	this.booting = false;
    } else {
	this.waiting_room_limit = 5 // set maximum waiting room time (in minutes)
	this.round_length = 6 // set how long each round will last (in minutes)
	this.max_bonus = 1.25; // total $ players can make in bonuses 
	this.booting = true;
    }

    // game and waiting length in seconds
    this.game_length = this.round_length*60*this.ticks_per_sec;

    //The speed at which the clients move (e.g. # px/tick)
    this.min_speed = 17 /this.ticks_per_sec; // 7.5cm * 3 * .5s 
    this.max_speed = 57 /this.ticks_per_sec; // 7.5cm * 3 * .5s 

    // minimun wage per tick
    var us_min_wage_per_tick = 7.25 / (60*60*(1000 / this.tick_frequency))
    this.waiting_background = us_min_wage_per_tick * this.game_length / this.max_bonus
    this.waiting_start = new Date(); 

    this.game_clock = 0;

    //We create a player set, passing them the game that is running
    //them, as well. Both the server and the clients need separate
    //instances of both players, but the server has more information
    //about who is who. Clients will be given this info later.
    if(this.server) {
        this.players = [{
            id: this.instance.player_instances[0].id, 
            player: new game_player(this,this.instance.player_instances[0].player)
        }];
    } else {
        this.players = [{
            id: null, 
            player: new game_player(this)
        }]
    }

    //Start a physics loop, this is separate to the rendering
    //as this happens at a fixed frequency. Capture the id so
    //we can shut it down at end.
    this.physics_interval_id = this.create_physics_simulation();
}; 

/* The player class
        A simple class to maintain state of a player on screen,
        as well as to draw that state when required.
*/
var game_player = function( game_instance, player_instance) {
    //Store the instance, if any
    this.instance = player_instance;
    this.game = game_instance;

    //Set up initial values for our state information
    this.size = { x:5, y:5, hx:2.5, hy:2.5 }; // 5+5 = 10px long, 2.5+2.5 = 5px wide
    this.state = 'not-connected';
    this.visible = "visible"; // Tracks whether client is watching game
    this.onwall = false;
    this.kicked = false;
    this.hidden_count = 0;
    this.inactive = false;
    this.inactive_count = 0;
    this.lagging = false;
    this.lag_count = 0;
    this.message = '';

    this.info_color = 'rgba(255,255,255,0)';
    this.id = '';
    this.curr_background = 0; // keep track of current background val
    this.avg_score = 0; // keep track of average score, for bonus
    this.total_points = 0; // keep track of total score, for paying participant

    //This is used in moving us around later
    this.old_state = {pos:{x:0,y:0}};

    //The world bounds we are confined to
    this.pos_limits = {
	    x_min: this.size.hx,
	    x_max: this.game.world.width - this.size.hx,
	    y_min: this.size.hy,
	    y_max: this.game.world.height - this.size.hy
    };
    if (this.game.server) {
        this.pos = get_random_position(this.game.world);
        this.angle = get_random_angle();
    } else {
        this.pos = null;
        this.angle = null;
    }
    this.speed = this.game.min_speed;
    this.old_speed = this.speed
    this.old_angle = this.angle
    this.color = 'white';
}; 

// server side we set the 'game_core' class to a global type, so that
// it can use it in other files (specifically, game.server.js)
if('undefined' != typeof global) {
    module.exports = global.game_core = game_core;
    module.exports = global.game_player = game_player;
}

// HELPER FUNCTIONS

// Method to easily look up player 
game_core.prototype.get_player = function(id) {
    var result = _.find(this.players, function(e){ return e.id == id; });
    return result.player
};

// Method to get list of players that aren't the given id
game_core.prototype.get_others = function(id) {
    return _.without(_.map(_.filter(this.players, function(e){return e.id != id}), 
        function(p){return p.player ? p : null}), null)
};

// Method to get whole list of players
game_core.prototype.get_active_players = function() {
    return _.without(_.map(this.players, function(p){
        return p.player ? p : null}), null)
};

// Takes two location objects and computes the distance between them
game_core.prototype.distance_between = function(obj1, obj2) {
    x1 = obj1.x;
    x2 = obj2.x;
    y1 = obj1.y;
    y2 = obj2.y;
    return Math.sqrt(Math.pow(x2 - x1, 2) + Math.pow(y2 - y1, 2));
};

//copies a 2d vector like object from one to another
game_core.prototype.pos = function(a) { return {x:a.x,y:a.y}; };

//Add a 2d vector with another one and return the resulting vector
game_core.prototype.v_add = function(a,b) { return { x:(a.x+b.x).fixed(), y:(a.y+b.y).fixed() }; };


// SERVER FUNCTIONS

// Notifies clients of changes on the server side. Server totally
// handles position and points.
game_core.prototype.server_send_update = function(){
    //Make a snapshot of the current state, for updating the clients
    var local_game = this;
    
    // Add info about all players
    var player_packet = _.map(local_game.players, function(p){
        if(p.player){
            return {id: p.id,
                    player: {
                        pos: p.player.pos,
                        cbg: p.player.curr_background,
			tot: p.player.total_points,
                        angle: p.player.angle,
                        speed: p.player.speed,
			onwall: p.player.onwall,
			kicked: p.player.kicked,
			inactive: p.player.inactive,
			lagging: p.player.lagging}}
        } else {
            return {id: p.id,
                    player: null}
        }
    })
    if(this.game_started) {
	var state = {
            gs : this.game_started,                      // true when game's started
	};
    } else {
	var state = {
            gs : this.game_started,                      // true when game's started
	    pt : this.players_threshold,
	    pc : this.player_count,
	    wr : new Date() - this.waiting_start
	};
    }
    _.extend(state, {players: player_packet})
    
    //Send the snapshot to the players
    this.state = state;
    _.map(local_game.get_active_players(), function(p){
	p.player.instance.emit( 'onserverupdate', state)})
};

// This is called every few ms and simulates the world state. This is
// where we update positions 
game_core.prototype.server_update_physics = function() {
    var local_gamecore = this;
    _.map(this.get_active_players(), function(p){
        var player = p.player;
        r1 = player.speed; 
        theta1 = (player.angle - 90) * Math.PI / 180;
        player.old_state.pos = local_gamecore.pos(player.pos) ;
        var new_dir = {
            x : r1 * Math.cos(theta1), 
            y : r1 * Math.sin(theta1)
        };  
        player.pos = local_gamecore.v_add( player.old_state.pos, new_dir );
	if(player.pos) {
            player.game.check_collision( player );
	}
        // Also update the current points at this new position
    })
};

// Every second, we print out a bunch of information to a file in a
// "data" directory. We keep EVERYTHING so that we
// can analyze the data to an arbitrary precision later on.
// game_core.prototype.writeData = function() {
//     var local_game = this;
//     _.map(local_game.get_active_players(), function(p) {
// 	var player_angle = p.player.angle;
// 	if (player_angle < 0) 
// 	    player_angle = parseInt(player_angle, 10) + 360;
// 	//also, keyboard inputs,  list of players in visibility radius?
// 	var line = String(p.id) + ',';
// 	line += String(local_game.game_clock) + ',';
// 	line += p.player.visible + ',';
// 	line += p.player.pos.x +',';
// 	line += p.player.pos.y +',';
// 	line += p.player.speed +',';
// 	line += player_angle +',';
// 	line += p.player.curr_background +',';
// 	line += p.player.total_points.fixed(2) ;
// 	if(local_game.game_started) {
// 	    local_game.gameDataStream.write(String(line) + "\n",
// 					    function (err) {if(err) throw err;});
// 	} else {
// 	    local_game.waitingDataStream.write(String(line) + "\n",
// 					    function (err) {if(err) throw err;});
// 	}
//     })
// };

// This is a really important function -- it gets called when a round
// has been completed, and updates the database with how much money
// people have made so far. This way, if somebody gets disconnected or
// something, we'll still know what to pay them.
game_core.prototype.server_newgame = function() {
    var local_gamecore = this;
    
    // Don't want players moving during countdown
    //_.map(local_gamecore.get_active_players(), function(p) {p.player.speed = 0;})
        
    //Reset positions
    //this.server_reset_positions();

    //Tell clients about it so they can call their newgame procedure (which does countdown)
    _.map(local_gamecore.get_active_players(), function(p) {
	p.player.instance.send('s.begin_game.')})

    // Launch game after countdown;
    setTimeout(function(){
        local_gamecore.game_started = true;
	local_gamecore.game_clock = 0;
//        _.map(local_gamecore.get_active_players(), function(p) {
//	    p.player.speed = local_gamecore.min_speed});
    }, 3000);
};

//Main update loop
game_core.prototype.update = function() {
    //Update the game specifics
    if(!this.server) 
        client_update();
    
    //schedule the next update
    this.updateid = window.requestAnimationFrame(this.update.bind(this), 
                                                 this.viewport);
};

// This gets called every iteration of a new game to reset positions
game_core.prototype.server_reset_positions = function() {
    var local_gamecore = this;
    _.map(local_gamecore.get_active_players(), function(p) {
        p.player.pos = get_random_center_position(local_gamecore.world);
        p.player.angle = get_random_angle(local_gamecore.world);
    })
}; 

//For the server, we need to cancel the setTimeout that the polyfill creates
game_core.prototype.stop_update = function() {  

    // Stop old game from animating anymore
    window.cancelAnimationFrame( this.updateid );  

    // Stop loop still running from old game (if someone is still left,
    // game_server.endGame will start a new game for them).
    clearInterval(this.physics_interval_id);
};

game_core.prototype.create_physics_simulation = function() {    
    return setInterval(function(){
	    // finish this interval by writing and checking whether it's the end

	if (this.server){
	    this.update_physics();
	}
	
	var local_game = this; // need a new local game w/ game clock change
	if(this.server) {
	    var active_players = local_game.get_active_players()
	    for(i=0;i<active_players.length;i++) {
		var p = active_players[i]
		// ping players to estimate latencies
		p.player.instance.emit('ping', {sendTime : Date.now(),
					        tick_num: local_game.game_clock})
		// compute scores
		if(p.player) {

		    var on_wall = local_game.check_collision(p.player)
		    if(on_wall) {
			p.player.curr_background = 0;
			p.player.onwall = true;
		    } else if(!this.game_started) {
			p.player.curr_background = local_game.waiting_background;
			p.player.onwall = false;
		    } else {
			p.player.onwall = false;
		    }
		    
		    p.player.avg_score = p.player.avg_score + p.player.curr_background/local_game.game_length;
		    p.player.total_points = p.player.avg_score * local_game.max_bonus;
		    
		    // Handle inactive, hidden, or high latency players...
		    if(p.player.kicked || p.player.inactive || p.player.lagging) {
			p.player.instance.disconnect();
		    } else {
			if(p.player.visible == 'hidden') {
			    p.player.hidden_count += 1
			}
			if(p.player.hidden_count > local_game.ticks_per_sec*15) { // kick after being hidden for 15 seconds
			    if(local_game.booting) {
				p.player.kicked = true
				console.log('Player ' + p.id + ' will be disconnected for being hidden.')
			    }
			}
			var not_changing = p.player.last_speed == p.player.speed && p.player.last_angle == p.player.angle;
			p.player.last_speed = p.player.speed
			p.player.last_angle = p.player.angle
			if(on_wall && not_changing) {
			    p.player.inactive_count += 1
			}
			if(p.player.inactive_count > local_game.ticks_per_sec*30) {  // kick after being inactive for 30 seconds
			    if(local_game.booting) {
				if(p.player.lag_count > local_game.game_clock*0.1) {
				    p.player.lagging = true
				    console.log('Player ' + p.id + ' will be disconnected because of latency.')
				} else {
				    p.player.inactive = true
				    console.log('Player ' + p.id + ' will be disconnected for inactivity.')
				}
			    }
			}
			if(p.player.latency > this.tick_frequency) {
			    if(p.player.visible != 'hidden') {
				p.player.lag_count += 1
			    }
			}
			if(p.player.lag_count > local_game.game_length*0.1) {
			    p.player.lagging = true
			    console.log('Player ' + p.id + ' will be disconnected because of latency.')
			}
		    }
		}
	    }
	}
	// If you're a player, tell the server about your angle only every 125ms
	if(!this.server){
	    if(game.get_player(my_id).angle) {
		this.socket.send('a.' + this.get_player(my_id).angle)
	    }
	}
	if (this.server){
            this.server_send_update();
//            this.writeData();
	}
	
	local_game.game_clock += 1;
	
	var local_game = this;
	if(this.server && this.game_started && this.game_clock == this.game_length) {
	    local_game.stop_update()
	    _.map(local_game.get_active_players(), function(p){
		p.player.instance.disconnect()})
	}
	

    }.bind(this), this.tick_frequency);
};

game_core.prototype.update_physics = function() {
  if(this.server) {
    this.server_update_physics();
  };
}

//Prevents people from leaving the arena
game_core.prototype.check_collision = function( item ) {
    
    var collision = false
    //Left wall.
    if(item.pos.x <= item.pos_limits.x_min){
	collision = true
        item.pos.x = item.pos_limits.x_min;
    }
    //Right wall
    if(item.pos.x >= item.pos_limits.x_max ){
	collision = true
        item.pos.x = item.pos_limits.x_max;
    }

    //Roof wall.
    if(item.pos.y <= item.pos_limits.y_min) {
	collision = true
        item.pos.y = item.pos_limits.y_min;
    }

    //Floor wall
    if(item.pos.y >= item.pos_limits.y_max ) {
	collision = true
        item.pos.y = item.pos_limits.y_max;
    }

    //Fixed point helps be more deterministic
    item.pos.x = item.pos.x.fixed(4);
    item.pos.y = item.pos.y.fixed(4);
    return collision
};

// MATH FUNCTIONS

get_random_position = function(world) {
    return {
        x: Math.floor((Math.random() * world.width) + 1),
        y: Math.floor((Math.random() * world.height) + 1)
    };
};

// At beginning of round, want to start people close enough 
// together that they can see at least one or two others...
// In circle with radius quarter size of tank.
get_random_center_position = function(world) {
    var theta = Math.random()*Math.PI*2;
    return {
        x: world.width /2 + (Math.cos(theta)* world.width /16),
        y: world.height/2 + (Math.sin(theta)* world.height/16)
    };
}
    
get_random_angle = function() {
    return Math.floor((Math.random() * 360) + 1);
};

// (4.22208334636).fixed(n) will return fixed point value to n places, default n = 3
Number.prototype.fixed = function(n) { n = n || 3; return parseFloat(this.toFixed(n)); };

function zeros(dimensions) {
    var array = [];

    for (var i = 0; i < dimensions[0]; ++i) {
        array.push(dimensions.length == 1 ? 0 : zeros(dimensions.slice(1)));
    }

    return array;
}

//The remaining code runs the update animations

//The main update loop runs on requestAnimationFrame,
//Which falls back to a setTimeout loop on the server
//Code below is from Three.js, and sourced from links below

//http://paulirish.com/2011/requestanimationframe-for-smart-animating/

//requestAnimationFrame polyfill by Erik Möller
//fixes from Paul Irish and Tino Zijdel
var frame_time = 60 / 1000; // run the local game at 16ms/ 60hz
if('undefined' != typeof(global)) frame_time = 4; //on server we run at 45ms, 22hz

( function () {

    var lastTime = 0;
    var vendors = [ 'ms', 'moz', 'webkit', 'o' ];

    for ( var x = 0; x < vendors.length && !window.requestAnimationFrame; ++ x ) {
        window.requestAnimationFrame = window[ vendors[ x ] + 'RequestAnimationFrame' ];
        window.cancelAnimationFrame = window[ vendors[ x ] + 'CancelAnimationFrame' ] || window[ vendors[ x ] + 'CancelRequestAnimationFrame' ];
    }

    if ( !window.requestAnimationFrame ) {
        window.requestAnimationFrame = function ( callback, element ) {
            var currTime = Date.now(), timeToCall = Math.max( 0, frame_time - ( currTime - lastTime ) );
            var id = window.setTimeout( function() { callback( currTime + timeToCall ); }, timeToCall );
            lastTime = currTime + timeToCall;
            return id;
        };
    }

    if ( !window.cancelAnimationFrame ) {
        window.cancelAnimationFrame = function ( id ) { clearTimeout( id ); };
    }
}() );
