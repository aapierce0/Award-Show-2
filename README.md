Award-Show-2
============

This is a party game that is played along with a variety of televised award shows. This game was originally designed with the Oscars in mind, but it could be used for just about any awards ceremony (Emmy, Grammy, Tony, Golden Globe, etc), as long as the nominees are known ahead of time.

This game requires one computer to act as the host, which will run the application, and serve the web applications to all the users. This machine will need to have node.js installed to run the application.

Setup
-----

Prerequisite: Have node.js installed on your system.

1. Download Award-Show-2 by cloning this repository.
2. Navigate to the directory from the command prompt.
3. Install dependancies: `npm install`.
4. Run the application: `node app`.
5. The application will tell you which URLs is can be accessed from. One of them is probably accessible over your local network.


Admin
-----

The admin page is available at [yourhostname]/admin. The password is hard-coded: "kevinspacey".

Once logged in, use this page to view established users, distribute credits, and specifiy category winners. This page is optimised for tablets and laptops.

TV
--

This view is designed to be viewed on a television, or other screen visible to all players. This view can be controlled directly from the admin page. It has four different "modes":

* **Setup**: This would typically be used while guests are getting setup on their phones. This view has directions for setting up your device, along with a QR code for the URL that should be used (so users don't have to type an IP address). In the admin page, you can specify what your local network name (SSID) is, its password, and select the URL to be used for the QR code. 
* **Category**: This will show the current bets placed on a specific category by all players. You can set this to be "called out category" which will automatically update to whichever category is about to be announced, or select a specific category that you think had an interesting turnout.
* **Leaderboard**: This will show one of several leaderboards that you can choose from. Select which one you like from the "Leaderboard" table.
* **Trivia**: When you want to have a trivia contest, use this tab to show the order of players who have buzzed in.

Player
------

This is the standard view for players. This view is optomised for small devices like smartphones. Users will be able to create an account, recieve credits, and begin making their predictions. They will also be able to see all other players' predictions as well, so they can change their mind if everyone is guessing in a particular way. All predictions are updated in real time.