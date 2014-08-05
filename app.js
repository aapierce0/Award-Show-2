PORT_NUMBER = 3000;

if (typeof String.prototype.startsWith != 'function') {
	String.prototype.startsWith = function (str){
		return this.lastIndexOf(str, 0) === 0;
	};
}

var express = require('express');
var app = express();
var http = require('http').Server(app);
var io = require('socket.io')(http);
var fs = require('fs');

var _ = require('underscore');
var uuid = require('node-uuid');





// Safari has a bug where it won't reload the right page.
app.get('/*', function(req, res, next){ 
	res.setHeader('Last-Modified', (new Date()).toUTCString());
	next(); 
});

app.use('/js', express.static(__dirname + '/js'));
app.use('/css', express.static(__dirname + '/css'));
app.use('/img', express.static(__dirname + '/img'));
app.use('/fonts', express.static(__dirname + '/fonts'));
app.use('/templates', express.static(__dirname + '/templates'));



// User Voting
app.get('/', function(req, res){
	res.sendfile('index.html');
});

// Television View
app.get('/tv', function(req, res){
	res.sendfile('tv.html');
});

// Admin View
app.get('/admin', function(req, res) {
	res.sendfile('admin.html');
});





// utility functions
function newUserNamed(username) {
	return {
		"name":username,
		"picks":{},
		"braggingRights":0,
		"score":0,
		"uuid":uuid.v4()
	}
}

function applyUpdatesToCollection(collection, updates, uniqueKey) {

	// updates might be an array, or it might be a simgle object to update.
	// Make sure to update all the items in the array.
	if (!_.isArray(updates)) {
		updates = [updates];
	}

	// Loop through each of the updated items.
	// If this item doesn't exist yet, add it.
	// If this item does exist, update it.
	var existingItems = _.pluck(collection, uniqueKey);
	_.each(updates, function(item) {

		// Check to see if this item already exists.
		if (_.contains(existingItems, item[uniqueKey])) {

			// The item already exists. Find this item, and replace it.
			var existingIndex = _.indexOf(existingItems, item[uniqueKey]);
			collection[existingIndex] = item;

		} else {

			// The item does not exist, so push it onto the stack.
			collection.push(item);

		}
	});
}






function readConfigSync(configIdentifier) {

	var configFile = __dirname + "/config/"+configIdentifier+".json";
	if (!fs.existsSync(configFile)) {

		// The file does not exists. Try the defaults file.
		configFile = __dirname + "/config/"+configIdentifier+".default.json";
		if (!fs.existsSync(configFile)) {

			return undefined;	
		}
	}

	// The file exists, so it's time to read it into memory
	var configString = fs.readFileSync(configFile, "utf8");
	var result = JSON.parse(configString);
	delete configString;

	return result;
}

function writeConfig(jsonData, configIdentifier) {
	var configFile = __dirname + "/config/"+configIdentifier+".json";
	fs.writeFile(configFile, JSON.stringify(jsonData, null, 4), function(err) {
		if(err) {
			console.log(err);
		} else {
			console.log("JSON saved to " + configFile);
		}
	});
}









// Load the list of categories and nominees.
var categories = readConfigSync("categories");

// Undefined categories is a fatal error condition. Exit immediately.
if (!categories) {
	console.log("\n\nERROR: file "+configFile+" does not exist. "+
		"You must create this file in order for the application to run properly.\n\n");
	return;
}

// Loop through the list of categories and make sure the values are set appropriately.
_.each(categories, function(category) {
	_.defaults(category, {distinguished: false, votingActive: false, value: 25, locked: false});

	// Loop through the nominees, and make sure each one defaults to "winner: false"
	_.each(category.nominees, function(nominee) {
		_.defaults(nominee, {winner: false});
	});
});
writeConfig(categories, "categories");

// If the client requests the categories, give them the contents of this variable.
app.get('/config/categories.json', function(req, res) {
	res.json(categories);
});












// Establish a set of users.
var users = readConfigSync("users");

// If the file does not exist, make users into an empty array.
if (!users) {
	users = [];
}

// If the user asks for the users, give them the JSON data from memory.
app.get('/config/users.json', function(req, res) {
	res.json(users);
});








// Load the trivia questions.
var triviaQuestions = readConfigSync("triviaQuestions");

// If the trivia questions do not exist, create an empty for it.
if (!triviaQuestions) {
	triviaQuestions = [];
}

app.get('/config/triviaQuestions.json', function(req, res) {
	res.json(triviaQuestions);
});











// User API
io.on('connection', function(socket){

	// Use this event to either retrieve the user from the list,
	// or create a new user with the provided name.
	socket.on("user:register", function(newUser, fn) {

		var currentUsernames = _.pluck(users, "name");
		if (!_.contains(currentUsernames, newUser)) {
			users.push(newUserNamed(newUser));

			io.sockets.emit("user:update", users);
			writeConfig(users, "users");
		}

		// Set the active user to this socket.
		var user = _.findWhere(users, {name: newUser});
		socket.user = user;

		fn(user);
	});

	// Retrieve a user for a particular UUID. The callback will return undefined 
	socket.on("user:uuid", function(userUUID, fn) {
		var user = _.findWhere(users, {uuid: userUUID});
		fn(user);
	});

	// When a user is updated, make sure to update the item in memory,
	// then broadcast the update to all other nodes.
	socket.on("user:update", function(updateUsers) {
		applyUpdatesToCollection(users, updateUsers, "uuid");

		socket.broadcast.emit("user:update", updateUsers);
		writeConfig(users, "users");
	});
});












// Category API
io.on('connection', function(socket){

	// When a category is updated, make sure to update the item in memory,
	// then broadcast the update to all other nodes.
	socket.on("category:update", function(updateCategories) {
		applyUpdatesToCollection(categories, updateCategories, "name");

		socket.broadcast.emit("category:update", updateCategories);
		writeConfig(categories, "categories");
	});


	socket.on("category:startCountdown", function(parameters) {

		console.log("Counting down for "+parameters.categoryName+". "+
			"Locking in "+parameters.secondsDelay+" seconds.");

		// Find the category with this name.
		var category = _.findWhere(categories, {name: parameters.categoryName});
		io.sockets.emit("category:startCountdown", parameters);

		setTimeout(function() {
			category.locked = true;
			io.sockets.emit("category:update", category);

			writeConfig(categories, "categories");
		}, parameters.secondsDelay /* seconds */ * 1000 /* milliseconds */);
	});
});










// Buzzer API
var buzzedUUIDs = [];
io.on('connection', function(socket) {

	// When a user buzzes in, mark them as buzzed.
	socket.on("buzzer:buzz", function(userUUID) {
		buzzedUUIDs.push(userUUID);
		io.sockets.emit("buzzer:allBuzzes", buzzedUUIDs);
	});

	socket.on("buzzer:unbuzz", function(userUUID) {
		buzzedUUIDs = _.without(buzzedUUIDs, userUUID);
		io.sockets.emit("buzzer:allBuzzes", buzzedUUIDs);
	});

	socket.on("buzzer:reset", function() {
		buzzedUUIDs = [];
		io.sockets.emit("buzzer:allBuzzes", buzzedUUIDs);
	});
});

// If the client requests the buzzes, give them the contents of this variable.
app.get('/config/buzzes.json', function(req, res) {
	res.json(buzzedUUIDs);
});

























// Fire up the web server.
http.listen(PORT_NUMBER, function(){

	// This logs all the IPs available on the current device.
	var os=require('os');
	var ifaces=os.networkInterfaces();
	var voterURL = "";
	var networkURLs = [];
	networkURLs.push("http://localhost:"+PORT_NUMBER);
	for (var dev in ifaces) {
		var alias=0;
		ifaces[dev].forEach(function(details){
			if (details.family=='IPv4') {
				++alias;

				var thisURL = "http://"+details.address+":"+PORT_NUMBER;
				networkURLs.push(thisURL);

				if (details.address.startsWith("192")) {
					voterURL = thisURL;
				}
			}
		});
	}

	// =========================
	// Welcome message
	console.log("");
	console.log("The Oscars app is now running locally on port "+PORT_NUMBER+".");
	console.log("");
	console.log("Point your browser to one of these URLS to try it out:");
	networkURLs.forEach(function(urlString) {
		console.log("    "+urlString);
	});
	console.log("");

	console.log("The admin site is available at one of these URLs:");
	networkURLs.forEach(function(urlString) {
		console.log("    "+urlString+"/admin");
	});
	console.log("");

	console.log("The TV site is available at one of these URLs:");
	networkURLs.forEach(function(urlString) {
		console.log("    "+urlString+"/tv");
	});
	console.log("");

});









