// Polyfill for requestAnimationFrame. Some older browsers don't implement this by default.
(function() {
	var lastTime = 0;
	var vendors = ['ms', 'moz', 'webkit', 'o'];
	for(var x = 0; x < vendors.length && !window.requestAnimationFrame; ++x) {
		window.requestAnimationFrame = window[vendors[x]+'RequestAnimationFrame'];
		window.cancelAnimationFrame = window[vendors[x]+'CancelAnimationFrame'] 
								   || window[vendors[x]+'CancelRequestAnimationFrame'];
	}
 
	if (!window.requestAnimationFrame)
		window.requestAnimationFrame = function(callback, element) {
			var currTime = new Date().getTime();
			var timeToCall = Math.max(0, 16 - (currTime - lastTime));
			var id = window.setTimeout(function() { callback(currTime + timeToCall); }, 
			  timeToCall);
			lastTime = currTime + timeToCall;
			return id;
		};
 
	if (!window.cancelAnimationFrame)
		window.cancelAnimationFrame = function(id) {
			clearTimeout(id);
		};
}());




var oscarsServices = angular.module("OscarsService", []);



// Socket IO for Angular JS
oscarsServices.factory('socket', function ($rootScope) {
	var socket = io.connect();
	return {
		on: function (eventName, callback) {
			socket.on(eventName, function () {  
				var args = arguments;
				$rootScope.$apply(function () {
					callback.apply(socket, args);
				});
			});
		},
		emit: function (eventName, data, callback) {
			socket.emit(eventName, data, function () {
				var args = arguments;
				$rootScope.$apply(function () {
					if (callback) {
						callback.apply(socket, args);
					}
				});
			});
		}
	};
});








// Oscars API
oscarsServices.factory('oscarsModel', function($rootScope, $http, socket, $timeout) {
	var oscarsModel = {};

	// Load the categories and nominees.
	oscarsModel.getCategories = $http.get("/config/categories.json").success(function(data) {
		oscarsModel.categories = data;
	});

	oscarsModel.getUsers = $http.get("/config/users.json").success(function(data) {
		oscarsModel.allUsers = data;
	});

	oscarsModel.getBuzzes = $http.get("/config/buzzes.json").success(function(data) {
		oscarsModel.buzzedUsers = _.map(data, function(uuid) {
			return _.findWhere(oscarsModel.allUsers, {uuid:uuid});
		});;
	});

	oscarsModel.getNetworkURLs = $http.get("/networkURLs.json");

	oscarsModel.getTriviaQuestions = $http.get("/config/triviaQuestions.json");
	oscarsModel.getTriviaQuestions.success(function(data) {
		oscarsModel.triviaQuestions = data;
	});




	// This countdown timer object will recieve 
	countdownTimer = {};
	socket.on("category:startCountdown", function(parameters) {

		var secondsDelay = parameters.secondsDelay;
		var categoryName = parameters.categoryName;
		countdownTimer[parameters.categoryName] = secondsDelay;

		while (secondsDelay > 0) {

			$timeout(function() {
				countdownTimer[categoryName]--;
			}, secondsDelay * 1000);

			secondsDelay--;
		}
	});
	oscarsModel.timeRemainingForCategory = function(category) {
		var result = countdownTimer[category.name];
		if (!result) {
			result = 0;
		}
		return result;
	}






	oscarsModel.usersWhoPicked = function(categoryName, nomineeTitle) {
		return _.filter(oscarsModel.allUsers, function(user) {
			return user.picks[categoryName] == nomineeTitle;
		});
	}

	oscarsModel.usersWhoVotedInCategoryNamed = function(categoryName) {
		return _.filter(oscarsModel.allUsers, function(user) {
			return user.picks[categoryName] && user.picks[categoryName].length > 0;
		});
	}

	oscarsModel.usersWhoWonCategory = function(category) {
		// There might have been a tie. Make sure to account for more than one winner.
		var winningNomineeTitles = _.pluck(_.where(category.nominees, {winner: true}), "title");
		var winningUsers = _.reduce(winningNomineeTitles, function(memo, nomineeTitle) {
			memo.push(oscarsModel.usersWhoPicked(category.name, nomineeTitle));
			return memo;
		}, []);
		return winningUsers[0]; // Not sure why this is an array within an array. Anyhow, the data we want is the first item in the list.
	}

	oscarsModel.categoryNamed = function(categoryName) {
		return _.findWhere(oscarsModel.categories, {name: categoryName});
	}

	oscarsModel.nomineeNamed = function(category, nomineeTitle) {
		return _.findWhere(category.nominees, {title: nomineeTitle});
	}

	oscarsModel.categoryWasCalled = function(category) {
		return _.some(category.nominees, function(nominee) {
			return nominee.winner;
		});
	};

	oscarsModel.calledOutCategory = function() {
		return _.findWhere(oscarsModel.categories, {calledOut: true});
	}

	oscarsModel.allCalledCategories = function() {
		return _.filter(oscarsModel.categories, oscarsModel.categoryWasCalled);
	}

	oscarsModel.allUncalledCategories = function() {
		return _.reject(oscarsModel.categories, oscarsModel.categoryWasCalled);
	}

	oscarsModel.winningNomineeForCategory = function(category) {
		return _.findWhere(category.nominees, {winner: true});
	}

	oscarsModel.nomineeLost = function(category, nominee) {
		// If any nominee in this category won other than the selected one, then they are a loser.
		return !nominee.winner && _.some(category.nominees, function(someNominee) {
			return someNominee.winner;
		});
	}

	oscarsModel.potForCategory = function(category) {
		return oscarsModel.usersWhoVotedInCategoryNamed(category.name).length * category.value
	}

	oscarsModel.payoutForCategory = function(category) {
		var voters = oscarsModel.usersWhoWonCategory(category);
		return (oscarsModel.potForCategory(category) / voters.length);
	}



	// This value is strictly how much money the user won.
	oscarsModel.winningsForUser = function(user) {

		return _.reduce(user.picks, function(memo, nomineeTitle, categoryName) {
			var category = oscarsModel.categoryNamed(categoryName);
			var nominee = oscarsModel.nomineeNamed(category, nomineeTitle);

			if (nominee.winner) {
				return memo + oscarsModel.payoutForCategory(category);
			} else {
				return memo;
			}

		}, 0);
	}


	// This is the total amount of money a user won or lost.
	oscarsModel.netIncomeForUser = function(user) {
		return _.reduce(user.picks, function(memo, nomineeTitle, categoryName) {
			var category = oscarsModel.categoryNamed(categoryName);
			var nominee = oscarsModel.nomineeNamed(category, nomineeTitle);

			if (nominee.winner) {
				return memo + oscarsModel.payoutForCategory(category) - category.value;
			} else {
				return memo - category.value;
			}

		}, 0);
	}


	// This method tells us how much the user is owed from the bank
	oscarsModel.balanceForUser = function(user) {
		return user.buyIn + oscarsModel.netIncomeForUser(user);
	}









	oscarsModel.totalWinsForUser = function(user) {

		var correctCategories = _.filter(oscarsModel.categories, function(category) {
			
			// Find the winners for this category
			// (there might be more than one, in the case of a tie)
			var winners = _.where(category.nominees, {winner: true});

			// If one of these winners was picked by the user, then it was a win.
			return _.some(winners, function(nominee) {
				return user.picks[category.name] == nominee.title;
			});
		});

		return correctCategories.length;
	}

	oscarsModel.totalLossesForUser = function(user) {

		// Count up the number of incorrect guesses in the user's picks.
		var losses = _.reduce(user.picks, function(memo, nomineeTitle, categoryName) {

			var category = oscarsModel.categoryNamed(categoryName);

			// First determine if this category was called yet. If not, then skip this one.
			if (!oscarsModel.categoryWasCalled(category))
				return memo;

			// If this nominee was not a winner, increment the number of losers.
			if (!oscarsModel.nomineeNamed(category, nomineeTitle).winner)
				memo++;

			return memo;
		}, 0);

		return losses;
	}

	oscarsModel.totalPicksForUser = function(user) {
		return _.size(user.picks);
	}

	oscarsModel.accuracyForUser = function(user) {

		var calledCategories = _.filter(oscarsModel.categories, oscarsModel.categoryWasCalled);
		if (calledCategories.length == 0)
			return "–";

		var wins = oscarsModel.totalWinsForUser(user);
		var calledCategoryNames = _.pluck(calledCategories, "name");
		var pickedCategoryNames = _.keys(user.picks);

		var calledAndPickedCategories = _.intersection(calledCategoryNames, pickedCategoryNames);
		if (calledAndPickedCategories.length == 0)
			return "–";

		return (wins / calledAndPickedCategories.length).toFixed(3);
	}

	oscarsModel.confidenceForUser = function(user) {
		var calledCategories = _.filter(oscarsModel.categories, oscarsModel.categoryWasCalled);
		if (calledCategories.length == 0)
			return "–";

		var calledCategoryNames = _.pluck(calledCategories, "name");
		var pickedCategoryNames = _.keys(user.picks);

		var calledAndPickedCategories = _.intersection(calledCategoryNames, pickedCategoryNames);

		return (calledAndPickedCategories.length / calledCategories.length).toFixed(3);
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







	// Make sure to update data when there are updates available.
	oscarsModel.applyUserUpdates = function(users) {
		applyUpdatesToCollection(oscarsModel.allUsers, users, "uuid");
	};
	socket.on("user:update", oscarsModel.applyUserUpdates);

	oscarsModel.applyCategoryUpdates = function(categories) {
		applyUpdatesToCollection(oscarsModel.categories, categories, "name");
	};
	socket.on("category:update", oscarsModel.applyCategoryUpdates);


	// We don't want to send the "$$hashkey" properties on these angular objects,
	// so we use Angular.copy() to strip them out before sending.
	oscarsModel.updateUsers = function(users) {
		var cleanUsers = angular.copy(users);
		socket.emit("user:update", cleanUsers);
		oscarsModel.applyUserUpdates(users);
	}

	oscarsModel.updateCategories = function(categories) {
		var cleanCategories = angular.copy(categories);
		socket.emit("category:update", cleanCategories);
		oscarsModel.applyCategoryUpdates(categories);
	}






	// Capture the list of buzzes
	socket.on("buzzer:allBuzzes", function(buzzedUUIDs) {
		oscarsModel.buzzedUsers = _.map(buzzedUUIDs, function(uuid) {
			return _.findWhere(oscarsModel.allUsers, {uuid:uuid});
		});
	});

	oscarsModel.userBuzzed = function(user) {
		return _.some(oscarsModel.buzzedUsers, function(buzzedUser) {
			return buzzedUser.uuid == user.uuid;
		});
	}

	oscarsModel.buzzUser = function(user) {
		socket.emit("buzzer:buzz", user.uuid);
	}

	oscarsModel.unbuzzUser = function(user) {
		socket.emit("buzzer:unbuzz", user.uuid);
	}

	oscarsModel.resetAllBuzzes = function() {
		socket.emit("buzzer:reset");
	}

	oscarsModel.unbuzzedUsers = function() {
		return _.difference(oscarsModel.allUsers, oscarsModel.buzzedUsers);
	}



	// TV API
	oscarsModel.setTVQRString = function(QRString) {
		socket.emit("tv:QRString", QRString);
	}

	oscarsModel.setTVViewName = function(viewName) {
		socket.emit("tv:viewName", viewName);
	}

	oscarsModel.setTVNetworkInfo = function(ssid, password) {
		socket.emit("tv:networkInfo", {SSID: ssid, password: password});
	}

	oscarsModel.setTVCategory = function(categoryName) {
		socket.emit("tv:category", categoryName);
	}

	oscarsModel.setTVLeaderboard = function(leaderboardName) {
		socket.emit("tv:leaderboardName", leaderboardName);
	}



	return oscarsModel;
});
