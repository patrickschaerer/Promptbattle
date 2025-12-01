# Promptbattle
Websites for a Promptbattle public game, where two contestants prompt a picture and the public has to decide who created the better picture.

Load index.html on the public screen, Spieler1.html on the screen of Player 1 and Spieler2.html on the screen of Player 2.

There must be installed on the webserver:
1. Socket.io
2. Fal.ia CLient
3. You need a Fal.ai API-Key

I use a raspberry pi with Lighttpd as a webserver.

Follow these commands to install (on a raspberry pi):

1. Lighttpd:
   
    sudo mkdir /var/www
   
    sudo groupadd www-data
   
    sudo adduser www-data www-data
   
    sudo usermod -a -G www-data www-data
   
    sudo chown -R www-data:www-data /var/www
   
    sudo apt-get update
   
    sudo apt-get install lighttpd
   
    sudo chown -R www-data:www-data /var/www/html
   
    sudo chmod -R 775 /var/www/html
   
    sudo service lighttpd force-reload
   
3. copy all of the files of this repository to /var/www/html
4. Node.js:

    sudo apt install nodejs npm -y
6. Fal.ai-client:

    npm install express socket.io @fal-ai/client
   
    nano ~/.bashrc
   
     at the bottom of the page add:  export FAL_KEY_ID="IHR_KEY_ID"
 export FAL_KEY_SECRET="IHR_KEY_SECRET"
   
    source ~/.bashrc
   
8. change the IP-Address in config.json to the webservers (raspberry pi) address.
9. After every reboot:
10. source ~/.bashrc
11. cd /var/www/html
12. node server.js
13. Load all html-Pages to play.

I am not a professional coder. Most of the code here I do not understand, but google gemini and claude.ai do and did all the coding for me :P

Have fun
Greets Patrick




   
