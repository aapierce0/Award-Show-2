/*
Copyright 2014 Avery Pierce
All Rights Reserved
*/

var oscarsApp = angular.module("Oscars", ["ngTouch"]);





oscarsApp.factory('socket', function ($rootScope) {
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

oscarsApp.factory('oscarsModel', function($rootScope, $http, socket, $timeout) {
	var oscarsModel = {};

	// Load the categories and nominees.
	$http.get("config/categories.json").success(function(data) {
		oscarsModel.categories = data;
	});

	$http.get("config/users.json").success(function(data) {
		oscarsModel.allUsers = data;
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

	oscarsModel.usersWhoVoted = function(categoryName) {
		return _.filter(oscarsModel.allUsers, function(user) {
			return user.picks[categoryName] && user.picks[categoryName].length > 0;
		});
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

	oscarsModel.nomineeLost = function(category, nominee) {
		// If any nominee in this category won other than the selected one, then they are a loser.
		return !nominee.winner && _.some(category.nominees, function(someNominee) {
			return someNominee.winner;
		});
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



	return oscarsModel;
});

















oscarsApp.controller("NomineePickerCtrl", function($scope, $http, $templateCache, socket, oscarsModel) {

	$scope.oscarsModel = oscarsModel;
	window.controllerScope = $scope;

	// cache the categories view
	$http.get("templates/categories.fragment.html", {cache:$templateCache});

	// This function is just a convenient way to load a template in the main view.
	$scope.setContentView = function(contentView) {
		this.contentURL = "templates/user."+contentView+".fragment.html";
	}




	// Categories screen
	$scope.selectNominee = function(category, nominee) {

		// Test to see if the category is locked. If so, the user cannot change their vote.
		if (oscarsModel.categoryNamed(category).locked)
			return;

		// If the user already selected this nominee, then this click should unselect it.
		if ($scope.me.picks[category] == nominee) {
			delete $scope.me.picks[category];
		} else {
			$scope.me.picks[category] = nominee;
		}

		oscarsModel.updateUsers($scope.me);
	}

	socket.on("user:update", function(users) {
		// Users might be an array, or it might be a single object to update.
		// Make sure to update all the users in the array.
		if (!_.isArray(users)) {
			users = [users];
		}

		var updatedMe = _.find(users, function(user) {
			return user.uuid == $scope.me.uuid;
		});

		// If updatedMe is undefined, that means the current users data hasn't changed.
		if (updatedMe) {
			$scope.me = updatedMe;
		}
	});




	// Go to the login screen when the app launches.
	$scope.setContentView("login");

	// Login screen
	$scope.usernameSubmit = function(usernameString) {

		$scope.loginDisabled = true;

		// console.log("test");
		socket.emit("user:register", usernameString, function(user) {
			// delete $scope.loginDisabled;
			$scope.loginDisabled = false;
			if (user) {

				// Set the username to the entered value
				$scope.me = user;
				$scope.setContentView("categories");

			} else {

				alert("Unable to login. There was an error");

			}
		});
	};
});





















oscarsApp.controller("TVCtrl", function($scope, socket, oscarsModel) {

	$scope.oscarsModel = oscarsModel;
	window.controllerScope = $scope;
});

















oscarsApp.controller("AdminCtrl", function($scope, socket, oscarsModel) {

	$scope.oscarsModel = oscarsModel;
	window.controllerScope = $scope;

	// This dictionary will hold the state of whether a particular category
	// should be allowed to update its winner. This is so you don't accidentally
	// change the winner of a category.
	$scope.acceptWinner = {};

	$scope.setSelectedTab = function(tabSelection) {
		this.contentURL = "templates/admin."+tabSelection+".fragment.html";
		this.selectedTab = tabSelection;
	}

	$scope.setSelectedTab("users");



	// This dictionary will automatically be updated with the entered value
	// for the score adjuster in the admin screen.
	$scope.adjustScores = {};

	$scope.addScore = function(user) {
		user.score += parseInt($scope.adjustScores[user.uuid]);
		delete $scope.adjustScores[user.uuid];
		oscarsModel.updateUsers(user);
	}

	$scope.subtractScore = function(user) {
		user.score -= parseInt($scope.adjustScores[user.uuid]);
		delete $scope.adjustScores[user.uuid];
		oscarsModel.updateUsers(user);
	}








	$scope.totalWinsForUser = function(user) {

		var correctCategories = _.filter(oscarsModel.categories, function(category) {
			
			// Find the winners for this category (there might be more than one, in the case of a tie)
			var winners = _.where(category.nominees, {winner: true});

			// If one of these winners was picked by the user, then it was a win.
			return _.some(winners, function(nominee) {
				return user.picks[category.name] == nominee.title;
			});
		});

		return correctCategories.length;
	}

	$scope.totalLossesForUser = function(user) {

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

	$scope.totalPicksForUser = function(user) {
		return _.size(user.picks);
	}

	$scope.accuracyForUser = function(user) {

		var calledCategories = _.filter(oscarsModel.categories, oscarsModel.categoryWasCalled);
		if (calledCategories.length == 0)
			return "–";

		var wins = this.totalWinsForUser(user);
		var calledCategoryNames = _.pluck(calledCategories, "name");
		var pickedCategoryNames = _.keys(user.picks);

		var calledAndPickedCategories = _.intersection(calledCategoryNames, pickedCategoryNames);

		return (wins / calledAndPickedCategories.length).toFixed(3);
	}

	$scope.confidenceForUser = function(user) {
		var calledCategories = _.filter(oscarsModel.categories, oscarsModel.categoryWasCalled);
		if (calledCategories.length == 0)
			return "–";

		var calledCategoryNames = _.pluck(calledCategories, "name");
		var pickedCategoryNames = _.keys(user.picks);

		var calledAndPickedCategories = _.intersection(calledCategoryNames, pickedCategoryNames);
		return (calledAndPickedCategories.length / calledCategories.length).toFixed(3);
	}







	// Signal all other clients that voting is about to close, and then automatically lock the account.
	$scope.startCountdownForCategory = function(category) {
		socket.emit("category:startCountdown", {categoryName: category.name, secondsDelay: 5});
	}

	// Immediately mark the category as locked.
	$scope.lockCategory = function(category) {
		category.locked = true;
		oscarsModel.updateCategories(category);
	}

	// Remove the "Winner" state from all the nominees and unlock the category
	$scope.unlockCategory = function(category) {
		category.locked = false;
		$scope.acceptWinner[category.name] = false;
		
		_.each(category.nominees, function(nominee) {
			nominee.winner = false;
		});

		oscarsModel.updateCategories(category);
	}

	$scope.prepareForWinnerSelection = function(category) {
		$scope.acceptWinner[category.name] = true;
	}

	$scope.pickWinner = function(category, nominee) {

		// Picking a winner should only happen if the category is locked.
		if (!category.locked || !$scope.acceptWinner[category.name])
			return;

		_.each(category.nominees, function(aNominee) {
			aNominee.winner = false;
		});
		nominee.winner = true;
		$scope.acceptWinner[category.name] = false;

		oscarsModel.updateCategories(category);
	}
});







