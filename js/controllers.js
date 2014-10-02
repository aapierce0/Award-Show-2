/*
Copyright 2014 Avery Pierce
All Rights Reserved
*/




var oscarsApp = angular.module("Oscars", ["OscarsService", "ngTouch"]);








oscarsApp.controller("NomineePickerCtrl", function($scope, $http, $templateCache, socket, oscarsModel) {

	$scope.oscarsModel = oscarsModel;
	window.controllerScope = $scope;

	$scope.webapp = window.navigator.standalone;
	if (window.navigator.standalone) {
		var statusBarStyleMetaTag = document.getElementById("status-bar-style");
		statusBarStyleMetaTag.parentNode.removeChild(statusBarStyleMetaTag);
	}

	// This function is just a convenient way to load a template in the main view.
	$scope.setContentView = function(contentView) {
		$scope.contentURL = "templates/user."+contentView+".fragment.html";
		$scope.contentView = contentView;
	}








	// When the users are loaded, check the localStorage for a user's UUID, then match it with an
	// existing user
	oscarsModel.getUsers.success(function(users) {
		if (localStorage["uuid"]) {
			
			var me = _.findWhere(users, {uuid: localStorage["uuid"]});
			if (me) {

				// Great, this item exists. Go to caqtegories view.
				$scope.me = me;
				$scope.setContentView("categories");
				return;
			}
		}

		// Go to the login screen when the app launches.
		$scope.setContentView("login");
	});


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
				localStorage["uuid"] = user.uuid;
				$scope.setContentView("categories");

			} else {

				alert("Unable to login. There was an error");

			}
		});
	};

	$scope.logout = function() {
		delete localStorage["uuid"];
		$scope.me = undefined;
		$scope.setContentView("login");
	}







	$scope.setFocusedCategory = function(category) {
		$scope.focusedCategory = category;
	}

	$scope.unsetFocusedCategory = function() {
		$scope.focusedCategory = undefined;
	}

	// Categories screen
	$scope.selectNominee = function(categoryName, nominee) {

		// Test to see if the category is locked. If so, the user cannot change their vote.
		var category = oscarsModel.categoryNamed(categoryName);
		if (category.locked)
			return;

		// If this user hasn't selected a nominee here, and they can't afford to bet, then they cannot vote.
		if (!$scope.me.picks[categoryName] && category.value > oscarsModel.balanceForUser($scope.me))
			return;

		// If the user already selected this nominee, then this click should unselect it.
		if ($scope.me.picks[categoryName] == nominee) {
			delete $scope.me.picks[categoryName];
		} else {
			$scope.me.picks[categoryName] = nominee;
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

	$scope.userWonCategory = function(category) {
		var nomineeTitle = $scope.me.picks[category.name];
		var nominee = oscarsModel.nomineeNamed(category, nomineeTitle);
		return nominee.winner;
	}










	window.addEventListener('resize', resizeCanvas, false);

	function resizeCanvas() {
		var canvas = document.getElementById('buzzerCanvas');
		if (canvas) {
			canvas.width = window.innerWidth;
			canvas.height = window.innerHeight;
		}
	}

	var duration = 3000; // higher numbers make the circles move slower
	var spacing = 20;
	var canvasResized = false;
	var fingerprintImg = new Image();
	fingerprintImg.src = "/img/fingerprint-256.png";

	function drawBuzzer(timestamp) {

		var canvas = document.getElementById('buzzerCanvas');
		if (canvas) {

			if (!canvasResized) {
				resizeCanvas();
				canvasResized = true;
			}

			var canvasCenterX = canvas.width/2;
			var canvasCenterY = canvas.height/2;

			// Draw the fingerprint in the middle of the canvas.
			var ctx = canvas.getContext('2d');
			ctx.clearRect(0, 0, canvas.width, canvas.height);
			ctx.lineWidth = 2;

			// The maximum circle radius is half of the longest side of the canvas.
			var maxRadius = Math.max(canvas.width, canvas.height) / 2;
			maxRadius = maxRadius * 1.1;
			var maxAlpha = 0.3;

			var adjustedDuration = duration;
			if ($scope.buzzerState == "submitted") {
				adjustedDuration /= 4;
			} else if ($scope.buzzerState == "accepted") {
				adjustedDuration /= 12;
			}

			var radiusInset = (timestamp % adjustedDuration) / (adjustedDuration/spacing);
			var biggestRadius = maxRadius - radiusInset;
			var thisRadius = biggestRadius;

			while (thisRadius > 0) {

				var strokeAlpha = (maxRadius - thisRadius) / maxRadius;
				strokeAlpha = strokeAlpha * maxAlpha;
				ctx.strokeStyle = "rgba(0, 0, 0, "+strokeAlpha+")";

				ctx.beginPath();
				ctx.arc(canvasCenterX, canvasCenterY, thisRadius, 0, Math.PI*2, false);
				ctx.stroke();

				thisRadius -= spacing;
			}

			// Mask out the middle part for the fingerprint image
			ctx.globalCompositeOperation = "destination-out";


			function drawEllipse(centerX, centerY, width, height) {
	
				ctx.beginPath();

				ctx.moveTo(centerX, centerY - height/2); // A1

				ctx.bezierCurveTo(
					centerX + width/2, centerY - height/2, // C1
					centerX + width/2, centerY + height/2, // C2
					centerX, centerY + height/2); // A2

				ctx.bezierCurveTo(
					centerX - width/2, centerY + height/2, // C3
					centerX - width/2, centerY - height/2, // C4
					centerX, centerY - height/2); // A1

				ctx.fillStyle = "white";
				ctx.fill();
			}

			var newImgWidth = (fingerprintImg.width/3);
			var newImgHeight = (fingerprintImg.height/3);
			drawEllipse(canvasCenterX, canvasCenterY-3, newImgWidth * 1.2, newImgHeight * 1.2);


			ctx.globalCompositeOperation = "source-over";

			// The fingerprint image should be scaled down to half size.
			var imageOriginX = canvasCenterX-(newImgWidth/2);
			var imageOriginY = canvasCenterY-(newImgHeight/2)
			ctx.drawImage(fingerprintImg, imageOriginX, imageOriginY, newImgWidth, newImgHeight);


		} else {
			canvasResized = false;
		}

		if (window.requestAnimationFrame)
			requestAnimationFrame(drawBuzzer);
	}

	if (window.requestAnimationFrame)
		requestAnimationFrame(drawBuzzer);


	$scope.buzzerState = "waiting";
	$scope.activateBuzzer = function() {
		$scope.buzzerState = "submitted";
		oscarsModel.buzzUser($scope.me);
	}

	socket.on("buzzer:allBuzzes", function(buzzedUUIDs) {
		// If our UUID is not in here, set the state to "waiting"
		if (!_.contains(buzzedUUIDs, $scope.me.uuid)) {
			$scope.buzzerState = "waiting";
		}

		if (_.first(buzzedUUIDs) == $scope.me.uuid) {
			$scope.buzzerState = "accepted";
		}
	});
});





















oscarsApp.controller("TVCtrl", function($scope, socket, oscarsModel) {

	$scope.oscarsModel = oscarsModel;
	window.controllerScope = $scope;

	$scope.setSelectedView = function(viewName) {
		$scope.viewName = viewName;
		$scope.contentURL = "templates/tv."+viewName+".fragment.html";
	}

	// $scope.setSelectedView("setup");
	$scope.setSelectedView("leaderboard");






	$scope.renderQRCode = function() {
		if ($scope.qrcode && $scope.setupURL) {
			$scope.qrcode.makeCode($scope.setupURL);
		}
	}

	$scope.$on("$includeContentLoaded", function() {
		if (document.getElementById("qrcode")) {
			$scope.qrcode = new QRCode("qrcode");
			$scope.renderQRCode();
		} else {
			delete $scope.qrcode;
		}
	});

	socket.on("tv:QRString", function(qrString) {
		$scope.setupURL = qrString;
		$scope.renderQRCode();
	});

	socket.on("tv:viewName", function(viewName) {
		$scope.setSelectedView(viewName);
	});

	socket.on("tv:networkInfo", function(networkInfo) {
		$scope.networkSSID = networkInfo.SSID;
		$scope.networkPassword = networkInfo.password;
	});



	$scope.focusedCategoryName = null;
	$scope.activeCategory = function() {
		if ($scope.focusedCategoryName) {
			return oscarsModel.categoryNamed($scope.focusedCategoryName);
		} else {
			return oscarsModel.calledOutCategory();
		}
	}

	socket.on("tv:category", function(categoryName) {
		$scope.focusedCategoryName = categoryName;
	});




	
	/*
	This variable controls which leaderboard is shown.
	Available options are:

	* "wins" - raw number of categories the user guessed correctly.
	* "accuracy" - percentage categories the player guessed correctly
	* "confidence" - how many categories the user chose to play in
	* "wealth" - player's current balance.
	* "winnings" - how much money the player has won/lost (not to be confused with "wins" above)
	*/

	$scope.leaderboardName = "wealth";

	socket.on("tv:leaderboardName", function(leaderboardName) {
		$scope.leaderboardName = leaderboardName;
	});


	$scope.leaderboardUsers = function() {

		var sortIterator;
		var shouldReverse = false;

		// The iterator should be chosen depending on which leaderboard we want to show.
		// For now, just use "wealthiest players"
		if ($scope.leaderboardName == "wins") {
			sortIterator = oscarsModel.totalWinsForUser;
			shouldReverse = true;
		} else if ($scope.leaderboardName == "accuracy") {
			sortIterator = oscarsModel.accuracyForUser;
			shouldReverse = true;
		} else if ($scope.leaderboardName == "confidence") {
			sortIterator = oscarsModel.confidenceForUser;
			shouldReverse = true;
		} else if ($scope.leaderboardName == "winnings") {
			sortIterator = oscarsModel.netIncomeCalledForUser;
			shouldReverse = true;
		} else if ($scope.leaderboardName == "wealth") {
			sortIterator = oscarsModel.balanceForUser;
			shouldReverse = true;
		}


		// Get the sorted array.
		var sortedArray = _.sortBy(oscarsModel.allUsers, sortIterator);

		if (shouldReverse)
			sortedArray.reverse();

		return sortedArray;
	}

	$scope.leaderboardTitle = function() {
		if ($scope.leaderboardName == "wins") {
			return "Players With Most Correct Guesses";
		} else if ($scope.leaderboardName == "accuracy") {
			return "Most Accurate Players";
		} else if ($scope.leaderboardName == "confidence") {
			return "Most Confident Players";
		} else if ($scope.leaderboardName == "winnings") {
			return "Most Profitable Players";
		} else if ($scope.leaderboardName == "wealth") {
			return "Wealthiest Players";
		}
	}
});

















oscarsApp.controller("AdminCtrl", function($scope, socket, oscarsModel) {


	$scope.oscarsModel = oscarsModel;
	window.controllerScope = $scope;

	// This dictionary will hold the state of whether a particular category
	// should be allowed to update its winner. This is so you don't accidentally
	// change the winner of a category.
	$scope.acceptWinner = {};

	

	$scope.setSelectedTab = function(tabSelection) {
		$scope.contentURL = "templates/admin."+tabSelection+".fragment.html";
		$scope.selectedTab = tabSelection;

		// If the user tapped the login button, disable the 
		if (tabSelection == "login") {
			$scope.authenticationFailure = false;
			$scope.authenticated = false;
		}
	}

	
	$scope.setSelectedTab("login");


	$scope.passwordSubmit = function(passwordAttempt) {
		if (passwordAttempt == "kevinspacey") {
			$scope.authenticated = true;
			$scope.setSelectedTab("users");
		} else {
			$scope.authenticationFailure = true;
		}
	}




	// This dictionary will automatically be updated with the entered value
	// for the score adjuster in the admin screen.
	$scope.adjustScores = {};

	$scope.addScore = function(user) {
		user.buyIn += parseInt($scope.adjustScores[user.uuid]);
		delete $scope.adjustScores[user.uuid];
		oscarsModel.updateUsers(user);
	}

	$scope.subtractScore = function(user) {
		user.buyIn -= parseInt($scope.adjustScores[user.uuid]);
		delete $scope.adjustScores[user.uuid];
		oscarsModel.updateUsers(user);
	}











	$scope.calloutCategory = function(category) {
		// If this category is already called out, do nothing.
		if (category.calledOut) {
			return;
		}

		// We might need to update more than one category. Create an array to hold them.
		var updateCategories = [];

		// Find the a category that is already called out, if any.
		var calledOutCategory = _.findWhere(oscarsModel.categories, {calledOut: true});
		if (calledOutCategory) {

			// Set this category to not be called out.
			calledOutCategory.calledOut = false;
			updateCategories.push(calledOutCategory);
		}

		// Set this category to be called out, and 
		category.calledOut = true;
		updateCategories.push(category);

		oscarsModel.updateCategories(updateCategories);
	}

	$scope.resetCallout = function() {
		var calledOutCategories = _.where(oscarsModel.categories, {calledOut: true});
		_.each(calledOutCategories, function(category) {
			category.calledOut = false;
		});
		
		oscarsModel.updateCategories(calledOutCategories);
	}

	// Signal all other clients that voting is about to close, 
	// and then automatically lock the account.
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

		// Now that the winner has been called, reset the callout.
		$scope.resetCallout();
	}












	$scope.setActiveQuestion = function(question) {
		$scope.activeQuestion = question;
	}

	$scope.userCorrect = function(user) {
		// Add some score to the user (eventually)
		oscarsModel.resetAllBuzzes();
	}

	$scope.userIncorrect = function(user) {
		// User loses a turn.
		oscarsModel.unbuzzUser(user);
	}









	// Get the list of networkURLs for the TV controller
	oscarsModel.getNetworkURLs.success(function(networkURLs) {
		$scope.networkURLs = networkURLs;
	});

});







