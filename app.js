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






// Load the list of categories and nominees.
var categories;
var categoriesFile = __dirname + '/config/categories.json';
if (fs.existsSync(categoriesFile)) {

	// The file exists, so it's time to read it into memory.
	var categoriesString = fs.readFileSync(categoriesFile, 'utf8');
	categories = JSON.parse(categoriesString);
	delete categoriesString; // We're done with the categories string, so we can delete it.
} else {

	// The file does not exist. Try the defaults file.
	var defaultCategoriesFile = __dirname + '/config/categories.default.json';
	if (fs.existsSync(defaultCategoriesFile)) {

		// The default file exists, so lets read that into memory.
		var categoriesString = fs.readFileSync(defaultCategoriesFile, 'utf8');
		categories = JSON.parse(categoriesString);
		delete categoriesString; // We're done with the categories string, so we can delete it.
	} else {

		console.log("\n\nERROR: file "+defaultCategoriesFile+" does not exist. The application cannot run without categories and nominees configured.\n\n");
		return;
	}
}

// If the client requests the categories, give them the contents of this variable.
app.get('/config/categories.json', function(req, res) {
	res.json(categories);
});

// This function will write the category data to disk
function writeCategories() {
	fs.writeFile(categoriesFile, JSON.stringify(categories, null, 4), function(err) {
		if(err) {
			console.log(err);
		} else {
			console.log("JSON saved to " + categoriesFile);
		}
	});
}












// Establish a set of users.
var users;
var usersFile = __dirname + '/config/users.json';
if (fs.existsSync(usersFile)) {

	// The file exists, so it's time to read it into memory.
	var usersString = fs.readFileSync(usersFile, 'utf8');
	users = JSON.parse(usersString);
	delete usersString;

} else {
	
	// The file does not exist, so make users into an empty object.
	users = [
		newUserNamed("Example")
	];
}

// If the user asks for the users, give them the JSON data from memory.
app.get('/config/users.json', function(req, res) {
	res.json(users);
});


// This function will write the users data to disk periodically.
function writeUsers() {
	fs.writeFile(usersFile, JSON.stringify(users, null, 4), function(err) {
		if(err) {
			console.log(err);
		} else {
			console.log("JSON saved to " + usersFile);
		}
	});
}













// User API
io.on('connection', function(socket){

	// Use this event to either retrieve the user from the list,
	// or create a new user with the provided name.
	socket.on("user:register", function(newUser, fn) {

		var currentUsernames = _.pluck(users, "name");
		if (!_.contains(currentUsernames, newUser)) {
			users.push(newUserNamed(newUser));

			io.sockets.emit("user:update", users);

			writeUsers();
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
		writeUsers();
	});
});












// Category API
io.on('connection', function(socket){

	// When a category is updated, make sure to update the item in memory,
	// then broadcast the update to all other nodes.
	socket.on("category:update", function(updateCategories) {
		applyUpdatesToCollection(categories, updateCategories, "name");

		socket.broadcast.emit("category:update", updateCategories);
		writeCategories();
	});


	socket.on("category:startCountdown", function(parameters) {

		console.log("Counting down for "+parameters.categoryName+". Locking in "+parameters.secondsDelay+" seconds.");

		// Find the category with this name.
		var category = _.findWhere(categories, {name: parameters.categoryName});
		io.sockets.emit("category:startCountdown", parameters);

		setTimeout(function() {
			category.locked = true;
			io.sockets.emit("category:update", category);

			writeCategories();
		}, parameters.secondsDelay /* seconds */ * 1000 /* milliseconds */);
	});
});













// Fire up the web server.
http.listen(3000, function(){
	console.log('listening on *:3000');
});









