//libraries

const fs = require("fs");
const ini = require("ini");
const Table = require('cli-table');
const { Client, MessageEmbed } = require('discord.js');
const client = new Client();
const mysql = require('mysql');
const moment = require('moment-timezone');

//vars
var config = ini.parse(fs.readFileSync('./config.ini', 'utf-8'));
var sqlConnection = undefined;
var server = undefined;
var sessionRunning = false;
var sessionCreated = undefined;

//all users that are **currently** registering are stored here
var registerUsers = [];

//channels

var welcomeChannel = undefined;
var generalChannel = undefined;
var registerChannel = undefined;
var adminChannel = undefined;

var currentSessionId = undefined;

class RegisterUser {

    constructor(user) {
        this.user = user;
        this.userId = user.id;
        this.member = server.members.cache.get(this.userId);
        this.state = 0;
        this.firstName = undefined;
        this.lastName = undefined;
        this.studentId = undefined;
        this.discordTag = user.tag;
        this.canRegister = false;
        this.firstRegister = true;
        this.init();
    }

    sendMsg(msg) {
        this.user.send(msg);
    }

    removeFromList() {

        var index = registerUsers.indexOf(this);

        if (index > -1) {
            registerUsers.splice(index, 1);
        }

    }

    insertDB(id) {

        var currentRegisterUser = this;

        sqlConnection.query("INSERT INTO `" + config.dbTables.users + "` (`id`, `firstname`, `lastname`, `studentid`, `discordtag`) VALUES ('" + id + "', '" + this.firstName + "', '" + this.lastName + "', '" + this.studentId + "', '" + this.discordTag + "');", function (err, result, fields) {
            if (err) throw err;
            currentRegisterUser.successfullyRegistered();
        });

    }

    addDB() {

        var currentRegisterUser = this;

        sqlConnection.query("SELECT COUNT(*) AS usersCount from " + config.dbTables.users, function (err, result, fields) {
            if (err) throw err;
            var usersCount = result[0].usersCount;

            //if the user table is empty

            if (usersCount == 0) {

                //insert first user with id 0
                currentRegisterUser.insertDB(0);


            } else {

                //if the user table is not empty
                //get last id add 1 for the next user

                sqlConnection.query("SELECT id as lastId FROM " + config.dbTables.users + " ORDER BY ID DESC LIMIT 1", function (err, result, fields) {
                    if (err) throw err;
                    var newId = parseInt(result[0].lastId) + 1;
                    currentRegisterUser.insertDB(newId);

                });

            }



        });


    }

    init() {


        var currentRegisterUser = this;

        //check if the discordTag is already known in the db

        sqlConnection.query("SELECT COUNT(*) AS userCount from " + config.dbTables.users + " WHERE discordtag='" + this.discordTag + "'", function (err, result, fields) {

            var count = result[0].userCount;

            if (count !== 0) {

                currentRegisterUser.sendMsg("You already registered !");
                currentRegisterUser.canRegister = false;
                currentRegisterUser.removeFromList();

            } else {

                currentRegisterUser.canRegister = true;

                if (currentRegisterUser.firstRegister) {
                    currentRegisterUser.sendMsg("Hey, please register to get access to MUIC Board Game Club !");
                }

                currentRegisterUser.sendMsg("Please tell me your First Name");

            }

        });



    }

    successfullyRegistered() {
        this.sendMsg("Successfully Registered !");
        welcomeChannel.send(`<@${this.userId}> just registered ! Welcome to MUIC Board Game Club !`);

        //figure out register success role
        var role = this.member.guild.roles.cache.find(r => r.id === config.Roles.registerSuccessRoleID);

        //add role
        this.member.roles.add(role);

        this.removeFromList();
    }

    onMessage(msg) {


        if (!this.canRegister) {
            return;
        }

        var response = msg.content.toLowerCase();

        if (this.state == 0) {

            this.firstName = response;
            this.sendMsg("Please tell me your Last Name");
            this.state++;

        } else if (this.state == 1) {

            this.lastName = response;
            this.sendMsg("Please tell me your Student ID");
            this.state++;

        } else if (this.state == 2) {



            let isnum = /^\d+$/.test(response);

            if (isnum) {

                this.studentId = response;

                //join confirm embed

                sendRegisterConfirmEmbed(this);

                this.state++;


            } else {
                this.sendMsg("Student ID can only be Numerical.");
                this.sendMsg("Please tell me your Student ID.");
            }



        } else if (this.state == 3) {

            if (response == "yes") {
                this.sendMsg("Processing Registration...");
                this.addDB();
            } else if (response == "no") {
              this.firstRegister = false;
              this.state = 0;
              this.init();
            } else {
              this.sendMsg(
                "Please type `yes` to confirm or `no` to start over. (Case-Sensitive)"
              );
            }



        }

    }

}


function initSql() {

    sqlConnection = mysql.createConnection({
        host: config.dbConnection.host,
        user: config.dbConnection.user,
        password: config.dbConnection.password,
        database: config.dbConnection.database
    });

    sqlConnection.connect(function (err) {
        if (err) throw err;
        console.log("[*] Successfully connected to Database !");
    });

}


client.on('ready', () => {
  console.log(`[*] Logged in as ${client.user.tag}!`);

  //get guild
  server = client.guilds.cache.get(config.Bot.serverId);

  console.log("[*] Server Owner -> " + server.owner.displayName);

  console.log("[*] Current Time: " + getCurrentTime());

  // Auto Change Status
  function pickStatus() {
    let status = [
      "for Quark",
      `for !bgc help`,
    ];
    let StatusRotate = Math.floor(Math.random() * status.length);

    // Set Activity
    client.user.setActivity(status[StatusRotate], {
      type: "WATCHING",
    });
  }

  // Set the status to change every 10 seconds
  setInterval(pickStatus, 10000);

  //handle channels

  welcomeChannel = client.channels.cache.get(config.Channel.welcomeChannelID);
  generalChannel = client.channels.cache.get(config.Channel.generalChannelID);
  registerChannel = client.channels.cache.get(config.Channel.registerChannelID);
  adminChannel = client.channels.cache.get(config.Channel.adminChannelID);
});



function getCurrentTime(){
    return moment.tz(moment(), config.Time.timeZone).format('YYYY-MM-DD HH:mm:ss');
}


function getRegisterUserFromUser(user) {
    for (var i in registerUsers) {
        var a = registerUsers[i];

        if (a.user === user) {
            return a;
        }
    }

    return undefined;
}





function sendJoinEmbed(discordId, discordTag) {

    var info = "";



    //Send join message embed 

    sqlConnection.query("SELECT DATE_FORMAT(jointime,'%m-%d-%y %H:%i:%s') as jointime,DATE_FORMAT(leavetime, '%m-%d-%y %H:%i:%s') as leavetime from " + config.dbTables.session + " WHERE discordtag='" + discordTag + "'" + " AND sessionid='" + currentSessionId + "'", function (err, result, fields) {

        if (err) throw err;

        info += "You have successfully registered your **JOIN** time";
        info += "\n\n";
        info += "**Registered Join Time**";
        info += "\n";
        info += result[0].jointime;
        info += "\n";
        info += "\n\n";
        info += "**Do not forget to type** `!bgc leave` **before leaving** ";
        info += "\n\n";
        info += "**Join Command**";
        info += "\n";
        info += "`!bgc join`";
        info += "\n\n";
        info += "**Leave Command**";
        info += "\n";
        info += "`!bgc leave`";
        info += "\n\n";

        const embed = new MessageEmbed()
            .setTitle('Join Time Registered :white_check_mark:')
            .setAuthor('BGC Admin', 'https://i.ibb.co/yQgNM2C/botprofile.png', 'http://parattapon.com')
            .setThumbnail('https://s5.gifyu.com/images/ezgif.com-optimized7ce94c5d4a783cb.gif')
            .setColor(0x00ff00)
            .addField("\u200B", info)
            .setFooter('Coded By Quark Hadron (Ryuu)', 'https://media.giphy.com/media/fTyVidxJsWCb8H6dZF/giphy.gif');

        registerChannel.send(embed);
        registerChannel.send(`<@${discordId}>`);


    });
}


function sendLeaveEmbed(discordId, discordTag) {

    var info = "";


    //Send join message embed 

    sqlConnection.query("SELECT DATE_FORMAT(jointime,'%m-%d-%y %H:%i:%s') as jointime,DATE_FORMAT(leavetime, '%m-%d-%y %H:%i:%s') as leavetime from " + config.dbTables.session + " WHERE discordtag='" + discordTag + "'" + " AND sessionid='" + currentSessionId + "'", function (err, result, fields) {

        if (err) throw err;

        info += "You have successfully registered your **LEAVE** time";
        info += "\n\n";
        info += "**Registered Leave Time**";
        info += "\n";
        info += result[0].leavetime;
        info += "\n\n";
        info += "You will be able to re-join.";
        info += "\n\n";
        info += "**Join Command**";
        info += "\n";
        info += "`!bgc join`";
        info += "\n\n";
        info += "**Leave Command**";
        info += "\n";
        info += "`!bgc leave`";
        info += "\n\n";

        const embed = new MessageEmbed()
            .setTitle('**Leave Time Registered** :white_check_mark:')
            .setAuthor('BGC Admin', 'https://i.ibb.co/yQgNM2C/botprofile.png', 'http://parattapon.com')
            .setThumbnail('https://s5.gifyu.com/images/ezgif.com-optimized7ce94c5d4a783cb.gif')
            .setColor(0x00ff00)
            .addField("\u200B", info)
            .setFooter('Coded By Quark Hadron (Ryuu)', 'https://media.giphy.com/media/fTyVidxJsWCb8H6dZF/giphy.gif');

        registerChannel.send(embed);
        registerChannel.send(`<@${discordId}>`);

    });
}


function sendReJoinEmbed(discordId, discordTag) {

    var info = "";


    //Send join message embed 

    sqlConnection.query("SELECT DATE_FORMAT(jointime,'%m-%d-%y %H:%i:%s') as jointime,DATE_FORMAT(leavetime, '%m-%d-%y %H:%i:%s') as leavetime from " + config.dbTables.session + " WHERE discordtag='" + discordTag + "'" + " AND sessionid='" + currentSessionId + "'", function (err, result, fields) {

        if (err) throw err;

        info += "You have successfully re-joined";
        info += "\n";
        info += "Registered Join time";
        info += "\n";
        info += result[1].jointime;
        info += "\n\n";
        info += "**Do not forget to Leave**";
        info += "\n\n";
        info += "**Join Command**";
        info += "\n";
        info += "`!bgc join`";
        info += "\n";
        info += "**Leave Command**";
        info += "\n";
        info += "`!bgc leave`";
        info += "\n";
        info += discordTag;


        const embed = new MessageEmbed()
            .setTitle('Rejoined :white_check_mark:')
            .setAuthor('BGC Admin', 'https://i.ibb.co/yQgNM2C/botprofile.png', 'http://parattapon.com')
            .setThumbnail('https://s5.gifyu.com/images/ezgif.com-optimized7ce94c5d4a783cb.gif')
            .setColor(0x00ff00)
            .addField("\u200B", info)
            .setFooter('Coded By Quark Hadron (Ryuu)', 'https://media.giphy.com/media/fTyVidxJsWCb8H6dZF/giphy.gif');


        registerChannel.send(embed);
        registerChannel.send(`<@${discordId}>`);

    });
}



function sendRegisterConfirmEmbed(user) {

    var info = "";

    info += "Please confirm your information";
    info += "\n\n";
    info += "First Name: `" + user.firstName + "`";
    info += "\n";
    info += "Last Name: `" + user.lastName + "`";
    info += "\n";
    info += "Student ID: `" + user.studentId + "`";
    info += "\n";
    info += "Type `yes` to confirm or `no` to start over. (Case-Sensitive)";


    //Send join confirm embed 

    const embed = new MessageEmbed()
        .setTitle('Confirm Your Information')
        .setAuthor('BGC Admin', 'https://i.ibb.co/yQgNM2C/botprofile.png', 'http://parattapon.com')
        .setThumbnail('https://i.ibb.co/yQgNM2C/botprofile.png')
        .setColor(0xA1FF00)
        .addField("\u200B", info)
        .setFooter('Coded By Quark Hadron (Ryuu)', 'https://media.giphy.com/media/fTyVidxJsWCb8H6dZF/giphy.gif');

    user.sendMsg(embed);

}

function generateSessionId() {
    //unix timestamp in seconds;
    return Math.floor(Date.now() / 1000)
}

function startSession(discordId) {

    if (!sessionRunning) {

        currentSessionId = generateSessionId();

        sqlConnection.query(`SELECT DATE_FORMAT('${getCurrentTime()}','%Y-%m-%d %H:%i:%s') as time`, function (err, result, fields) {
            if (err) throw err;
            sessionCreated = result[0].time;
            console.log(`[*] Created Session with id=${currentSessionId} at ${sessionCreated}`)
        });

        sessionRunning = true;
        registerChannel.send(`<@${discordId}>, session started !`);

    } else {
        registerChannel.send(`<@${discordId}>, the session is already running !`);
    }

}


function endSession(discordId) {

    if (sessionRunning) {

        sessionRunning = false;
        registerChannel.send(`<@${discordId}>, session stopped !`);

    } else {

        registerChannel.send(`<@${discordId}>, there is no session running !`);

    }

}

function joinSession(discordId, discordTag) {



    sqlConnection.query(`SELECT id from ${config.dbTables.session} WHERE discordtag='${discordTag}' AND sessionid='${currentSessionId}' `, function (err, result, fields) {

        if (err) throw err;

        //check if the user has already joined the current session

        if (result[0] == undefined) {

            //user has not joined the session 

            var id = 0;

            //get the last id

            sqlConnection.query(`SELECT id as lastId FROM  ${config.dbTables.session} ORDER BY ID DESC LIMIT 1`, function (err, result, fields) {

                if (err) throw err;

                if (result[0] == undefined) {

                    //the session is empty. start with id 0
                    id = 0;

                } else {

                    //the session is not empty. set id to lastId + 1
                    id = parseInt(result[0].lastId) + 1;

                }


                //insert 

                sqlConnection.query(`INSERT INTO  ${config.dbTables.session} (id, sessioncreated, sessionid, jointime, leavetime, timespend, discordtag) VALUES (${id},'${sessionCreated}','${currentSessionId}', '${getCurrentTime()}', '2001-01-01',0, '${discordTag}');`, function (err, result, fields) {

                    if (err) throw err;


                    sendJoinEmbed(discordId, discordTag);


                });

            });



        } else {

            //user already joined 

            //rejoin

            sqlConnection.query(`SELECT DATE_FORMAT(leavetime,'%m-%d-%y %H:%i:%s') as leaveTime from ${config.dbTables.session} WHERE sessionid='${currentSessionId}' AND discordtag='${discordTag}'`, function (err, result, fields) {

                if (err) throw err;

                if (result[0].leaveTime === "01-01-01 00:00:00") {

                    registerChannel.send(`<@${discordId}>, you already joined the session. (you can leave & re-join)`);

                } else {


                    sqlConnection.query(
                      `INSERT INTO  ${
                        config.dbTables.session
                      } (sessioncreated, sessionid, jointime, leavetime, timespend, discordtag) VALUES ('${sessionCreated}','${currentSessionId}', '${getCurrentTime()}', '2001-01-01',0, '${discordTag}');`,
                      function (err, result, fields) {
                        if (err) throw err;
                        sendReJoinEmbed(discordId, discordTag);
                      }
                    );


                }

            });






        }

    });

}


function leaveSession(discordId, discordTag) {

    //check if user is in the session

    sqlConnection.query(`SELECT id from ${config.dbTables.session} WHERE discordtag='${discordTag}' AND sessionid='${currentSessionId}' `, function (err, result, fields) {

        if (err) throw err;

        if (result[0] == undefined) {

            //user is not in the current session
            registerChannel.send(`<@${discordId}>, you are not in the session !`);

        } else {

            //user is in the current session

            //check if the user already left the session

            sqlConnection.query(`SELECT DATE_FORMAT(leavetime,'%m-%d-%y %H:%i:%s') as leaveTime, timespend as timeSpend from ${config.dbTables.session} WHERE sessionid='${currentSessionId}' AND discordtag='${discordTag}'`, function (err, result, fields) {



                if (err) throw err;

                //the seconds before we add the current timespan
                var oldTimeSpend = result[0].timeSpend;



                if (
                  result[0].leaveTime === "01-01-01 00:00:00" 
                ) {
                  //user did not leave yet

                  //update leave time
                  sqlConnection.query(
                    `UPDATE ${
                      config.dbTables.session
                    } SET leavetime='${getCurrentTime()}' WHERE sessionid='${currentSessionId}' AND discordtag='${discordTag}' ORDER BY ID DESC LIMIT 1`,
                    function (err, result, fields) {
                      if (err) throw err;

                      //now calculated time spend from current session

                      sqlConnection.query(
                        `SELECT TIMESTAMPDIFF(SECOND,jointime,leavetime) as timeDiff from ${config.dbTables.session} WHERE sessionid='${currentSessionId}' AND discordtag='${discordTag}'`,
                        function (err, result, fields) {
                          if (err) throw err;

                          var nowTimeSpend = result[0].timeDiff;

                          var totalSecondsSpendInSession =
                            oldTimeSpend + nowTimeSpend;

                          //update total time spend

                          sqlConnection.query(
                            `UPDATE ${config.dbTables.session} SET timespend=${totalSecondsSpendInSession} WHERE sessionid='${currentSessionId}' AND discordtag='${discordTag}'`,
                            function (err, result, fields) {
                              sendLeaveEmbed(discordId, discordTag);
                            }
                          );
                        }
                      );
                    }
                  );
                } else {
                  //user already left

                  registerChannel.send(
                    `<@${discordId}>, you already left the session.`
                  );
                }


            });



        }

    });

}

function secondsToString(seconds) {
    //var numyears = Math.floor(seconds / 31536000);
    //var numdays = Math.floor((seconds % 31536000) / 86400); 
    var numhours = Math.floor(((seconds % 31536000) % 86400) / 3600);
    var numminutes = Math.floor((((seconds % 31536000) % 86400) % 3600) / 60);
    var numseconds = (((seconds % 31536000) % 86400) % 3600) % 60;
    return numhours + " hours " + numminutes + " minutes " + numseconds + " seconds";


}

function checkSessionTotalTime(discordId, discordTag) {

    //count the sessions where the user took part
    sqlConnection.query(`SELECT COUNT(id) AS numberOfSessions FROM ${config.dbTables.session} WHERE discordtag='${discordTag}'`, function (err, result, fields) {

        if (err) throw err;

        var sessionCount = result[0].numberOfSessions;


        //get the timespend seconds from the user from all sessions
        sqlConnection.query(`SELECT timespend as timeSpend from ${config.dbTables.session}  WHERE discordtag='${discordTag}'`, function (err, result, fields) {

            var totalSeconds = 0;

            if (err) throw err;

            for (var i in result) {
                var res = result[i];
                var timeSpend = parseInt(res.timeSpend);

                totalSeconds += timeSpend;
            }


            var totalTimeSpend = secondsToString(totalSeconds);


            generalChannel.send(`<@${discordId}>, you spent a total of ${totalTimeSpend} in ${sessionCount} session(s).`);

        });


    });


}


function checkSessionDailyTime(discordId, discordTag) {



    //count the sessions where the user took part
    sqlConnection.query(`SELECT COUNT(id) AS numberOfSessions FROM ${config.dbTables.session} WHERE discordtag='${discordTag}' and leavetime >= UNIX_TIMESTAMP(CURDATE())`, function (err, result, fields) {

        if (err) throw err;

        var sessionCount = result[0].numberOfSessions;


        //get the timespend seconds from the user from all sessions
        sqlConnection.query(`SELECT timespend as timeSpend from ${config.dbTables.session}  WHERE discordtag='${discordTag}' and leavetime >= UNIX_TIMESTAMP(CURDATE())`, function (err, result, fields) {

            var totalSeconds = 0;

            if (err) throw err;

            for (var i in result) {
                var res = result[i];
                var timeSpend = parseInt(res.timeSpend);

                totalSeconds += timeSpend;
            }


            var totalTimeSpend = secondsToString(totalSeconds);


            generalChannel.send(`<@${discordId}>, you spent ${totalTimeSpend} in ${sessionCount} session(s) today.`);

        });


    });


}


class Page {
    constructor() {
        this.embeds = [];
    }

    addEmbed(embed) {
        this.embeds.push(embed);
    }

    print(channel) {
        for (var i in this.embeds) {
            var embed = this.embeds[i];
            channel.send(embed);
        }
    }
}


function getTotalTimeByDiscordTagAsync(discordtag) {

    return new Promise((resolve, reject) => {

        sqlConnection.query(`SELECT timespend as timeSpend from ${config.dbTables.session} WHERE discordtag='${discordtag}'`, function (err, result, fields) {

            if (err) throw err;

            //get total time

            var totalSeconds = 0;


            if (result[0] !== undefined) {

                for (var s in result) {
                    var seconds = result[s].timeSpend;
                    totalSeconds += seconds;
                }

            }else {
                resolve("NOTFOUND");
            }

            resolve(secondsToString(totalSeconds));

        });

    });

}



function sendTotalTimeByDiscordTag(channel, discordtag) {

    sqlConnection.query(`SELECT * from ${config.dbTables.session} INNER join ${config.dbTables.users} on ${config.dbTables.users}.discordtag = ${config.dbTables.session}.discordtag`, function (err, result, fields) {

        if (err) throw err;

        //get total time

        var totalSeconds = 0;
        var found = false;
        var studentid = "";


        if (result[0] !== undefined) {



            for (var s in result) {

                if (result[s].discordtag == discordtag) {
                    var seconds = result[s].timespend;
                    studentid = result[s].studentid;
                    totalSeconds += seconds;
                    found = true;
                }

            }

        } else {
            channel.send(`**ERROR !** \n Could not check the total time of ${discordtag}. User was not found in database !`);
            return;
        }

        if (!found) {
            channel.send(`**ERROR !** \n Could not check the total time of ${discordtag}. User was not found in database !`);
            return;
        }







        var info = "";

        info += "Discord Tag " + "`" + discordtag + "`";
        info += "\n";
        info += "Student ID " + "`" + studentid + "`";
        info += "\n";
        info += "Time Spent " + "`" + secondsToString(totalSeconds) + "`";



        const embed = new MessageEmbed()
            .setTitle("BGC Time Check")
            .setAuthor('BGC Admin', 'https://i.ibb.co/yQgNM2C/botprofile.png', 'http://parattapon.com')
            .setThumbnail('https://i.ibb.co/yQgNM2C/botprofile.png')
            .setColor(0xFF9900)
            .addField("\u200B", info)
            .setFooter('Coded By Quark Hadron (Ryuu)', 'https://media.giphy.com/media/fTyVidxJsWCb8H6dZF/giphy.gif');

        channel.send(embed);

    });

}




function sendTotalTimeByStudentId(channel, studentid) {



    sqlConnection.query(`SELECT * from ${config.dbTables.session} INNER join ${config.dbTables.users} on ${config.dbTables.users}.discordtag = ${config.dbTables.session}.discordtag`, function (err, result, fields) {

        if (err) throw err;

        //get total time

        var totalSeconds = 0;
        var found = false;
        var discordTag = "";

        if (result[0] !== undefined) {


            for (var s in result) {

                if (result[s].studentid == studentid) {
                    discordTag = result[s].discordtag;
                    var seconds = result[s].timespend;
                    totalSeconds += seconds;
                    found = true;
                }

            }


        } else {
            channel.send(`**ERROR !** \n Could not check the total time of Student ID ${studentid}. Student ID was not found in database !`);
            return;
        }


        if (!found) {
            channel.send(`**ERROR !** \n Could not check the total time of Student ID ${studentid}. Student ID was not found in database !`);
            return;
        }


        var info = "";

        info += "Discord Tag " + "`" + discordTag + "`";
        info += "\n";
        info += "Student ID " + "`" + studentid + "`";
        info += "\n";
        info += "Time Spent " + "`" + secondsToString(totalSeconds) + "`";



        const embed = new MessageEmbed()
            .setTitle("BGC Timecheck")
            .setAuthor('BGC Admin', 'https://i.ibb.co/yQgNM2C/botprofile.png', 'http://parattapon.com')
            .setThumbnail('https://i.ibb.co/yQgNM2C/botprofile.png')
            .setColor(0xFF9900)
            .addField("\u200B", info)
            .setFooter('Coded By Quark Hadron (Ryuu)', 'https://media.giphy.com/media/fTyVidxJsWCb8H6dZF/giphy.gif');


        channel.send(embed);

    });



}


function printUserDb(page) {

    sqlConnection.query(`SELECT * from ${config.dbTables.users}`, async function (err, result, fields) {

        if (err) throw err;

        var pages = [];
        var itemsPerPage = 5;
        var currentPage = new Page();

        for (var i in result) {

            var res = result[i];

            var discordtag = res.discordtag;


            var info = "";

            info += "First Name " + "`" + res.firstname + "`";
            info += "\n";
            info += "Last Name " + "`" + res.lastname + "`";
            info += "\n";
            info += "Student ID " + "`" + res.studentid + "`";
            info += "\n";
            info += "Time Spent " + "`" + await getTotalTimeByDiscordTagAsync(discordtag) + "`";



            const embed = new MessageEmbed()
                .setTitle(discordtag)
                .setAuthor('BGC Admin', 'https://i.ibb.co/yQgNM2C/botprofile.png', 'http://parattapon.com')
                .setThumbnail('https://i.ibb.co/yQgNM2C/botprofile.png')
                .setColor(0x00FFFF)
                .addField("\u200B", info)
                .setFooter('Coded By Quark Hadron (Ryuu)', 'https://media.giphy.com/media/fTyVidxJsWCb8H6dZF/giphy.gif');



            if (currentPage.embeds.length < itemsPerPage) {
                currentPage.addEmbed(embed);
            } else {
                pages.push(currentPage);
                currentPage = new Page();
                currentPage.addEmbed(embed);
            }



        }



        if (!pages.includes(currentPage)) {
            pages.push(currentPage);
        }

        var wantedPage = pages[(page - 1)];
        var pagesCount = pages.length;


        if (pages.length == 0) {

            adminChannel.send(`There are no users !`);

        } else {

            if (wantedPage == undefined) {
                adminChannel.send(`Page ${page} is Empty`);
                adminChannel.send(`Try Page 1-${pagesCount}`);
            } else {

                adminChannel.send(`Showing Page ${page} of ${pagesCount}`);
                wantedPage.print(adminChannel);
            }


        }



    });




}



function printSessionDb(page) {


    sqlConnection.query(`SELECT id,DATE_FORMAT(sessioncreated,'%m-%d-%y %H:%i:%s') as sessioncreated,sessionid,DATE_FORMAT(jointime,'%m-%d-%y %H:%i:%s') as jointime, DATE_FORMAT(leavetime,'%m-%d-%y %H:%i:%s') as leavetime,timespend,discordtag from ${config.dbTables.session}`, function (err, result, fields) {

        if (err) throw err;

        var pages = [];
        var itemsPerPage = 10;
        var currentPage = new Page();

        for (var i in result) {
            var res = result[i];


            var info = "";

            info += "Session Created At " + "`" + res.sessioncreated + "`";
            info += "\n";
            info += "Join Time " + "`" + res.jointime + "`";
            info += "\n";
            info += "Leave Time " + "`" + res.leavetime + "`";
            info += "\n";
            info += "Time Spent " + "`" + secondsToString(res.timespend) + "`";

            const embed = new MessageEmbed()
                .setTitle(res.discordtag)
                .setAuthor('BGC Admin', 'https://i.ibb.co/yQgNM2C/botprofile.png', 'http://parattapon.com')
                .setThumbnail('https://i.ibb.co/yQgNM2C/botprofile.png')
                .setColor(0x03f0fc)
                .addField("\u200B", info)
                .setFooter('Coded By Quark Hadron (Ryuu)', 'https://media.giphy.com/media/fTyVidxJsWCb8H6dZF/giphy.gif');


            if (currentPage.embeds.length < itemsPerPage) {
                currentPage.addEmbed(embed);
            } else {
                pages.push(currentPage);
                currentPage = new Page();
                currentPage.addEmbed(embed);
            }


        }


        if (!pages.includes(currentPage)) {
            pages.push(currentPage);
        }

        var wantedPage = pages[(page - 1)];
        var pagesCount = pages.length;


        if (pages.length == 0) {

            adminChannel.send(`There are no sessions !`);

        } else {

            if (wantedPage == undefined) {
                adminChannel.send(`Page ${page} is Empty`);
                adminChannel.send(`Try Page 1-${pagesCount}`);
            } else {

                adminChannel.send(`Showing Page ${page} of ${pagesCount}`);
                wantedPage.print(adminChannel);
            }


        }


    });

}

function printHelp(channel,discordId) {


    var info = "";
    
    info += "__**USER COMMANDS**__";
    info += "\n\n";
    info += "Join current session";
    info += "\n";
    info += "`!bgc join`";
    info += "\n\n";
    info += "Leave current session";
    info += "\n";
    info += "`!bgc leave`";
    info += "\n\n";
    info += "Show total time spent in all session(s)";
    info += "\n";
    info += "`!bgc totaltime`";
    info += "\n\n";
    info += "Show total time spent in all session(s) **from today**";
    info += "\n";
    info += "`!bgc dailytime`";
    info += "\n\n\n\n";
    info += "__**CMM COMMANDS**__";
    info += "\n\n";
    info += "Start new session";
    info += "\n";
    info += "`!bgc session start`";
    info += "\n\n";
    info += "End current session";
    info += "\n";
    info += "`!bgc session end`";
    info += "\n\n";
    info += "Show information about all session(s)";
    info += "\n";
    info += " `!bgc showallsessions <page>`";
    info += "\n\n";
    info += "Show information about all user(s)";
    info += "\n";
    info += "`!bgc showallusers <page>`";
    info += "\n\n";
    info += "Show total time of that user";
    info += "\n";
    info += "`!bgc totaltime <student id / @user>`";
    info += "\n\n\n\n";
    info += "\n";

    const embed = new MessageEmbed()
        .setTitle("BGC Help")
        .setAuthor('BGC Admin', 'https://i.ibb.co/yQgNM2C/botprofile.png', 'http://parattapon.com')
        .setThumbnail('https://i.ibb.co/yQgNM2C/botprofile.png')
        .setColor(0xFFFF00)
        .addField("\u200B", info)
        .setFooter('Coded By Quark Hadron (Ryuu)', 'https://media.giphy.com/media/fTyVidxJsWCb8H6dZF/giphy.gif');


    channel.send(embed);
    channel.send(`<@${discordId}>`);

}


function sendWrongChannelEmbed(wrongChannel,rightChannelName,discordId){

    
    var info = "";

    info += `Please use this command in ${rightChannelName} channel !`;
    info += "\n";

    const embed = new MessageEmbed()
    .setTitle("**Wrong Channel**")
    .setAuthor('BGC Admin', 'https://i.ibb.co/yQgNM2C/botprofile.png', 'http://parattapon.com')
        .setThumbnail('https://media.giphy.com/media/pjFF8YLW996aXqFHAu/source.gif')
    .setColor(0xff0000)
    .addField("\u200B", info)
    .setFooter('Coded By Quark Hadron (Ryuu)', 'https://media.giphy.com/media/fTyVidxJsWCb8H6dZF/giphy.gif');


    wrongChannel.send(embed);
    wrongChannel.send(`<@${discordId}>`);

}

client.on('message', msg => {

    // var displayName = msg.member.displayName;
    var discordTag = msg.author.tag;


    var member = msg.member;
    var user = msg.author;
    var discordId = user.id;
    var channel = msg.channel;



    var regUser = getRegisterUserFromUser(user);

    if (regUser !== undefined) {

        if (msg.channel.type === "dm") {
            regUser.onMessage(msg);
        }

    } else if (msg.content.startsWith("!bgc ") && msg.channel.type == "text") {



        var cmd = msg.content.split("!bgc ")[1];


        //check roles

        if (cmd === "session start" || cmd === "session end" || cmd === "showallusers" || cmd === "showallsessions") {

            if (!msg.member.roles.cache.find(r => r.id === config.Roles.commandRoleID)) {
                registerChannel.send(`<@${discordId}>, you don't have permission !`);
                return;
            }

        }


        if (cmd === "session start") {

            if(channel.id != registerChannel.id){
                sendWrongChannelEmbed(channel, `${registerChannel}`,discordId);
                return;
            }

            startSession(discordId);

        } else if (cmd === "session end") {

            if(channel.id != registerChannel.id){
                sendWrongChannelEmbed(channel, `${registerChannel}`,discordId);
                return;
            }

            endSession(discordId);

        } else if (cmd === "join") {


            if(channel.id != registerChannel.id){
                sendWrongChannelEmbed(channel, `${registerChannel}`,discordId);
                return;
            }

            if (sessionRunning) {
                joinSession(discordId, discordTag);
            } else {
                registerChannel.send(`<@${discordId}>, there is no session running !`);
            }

        } else if (cmd === "leave") {

            if(channel.id != registerChannel.id){
                sendWrongChannelEmbed(channel, `${registerChannel}`,discordId);
                return;
            }

            if (sessionRunning) {
                leaveSession(discordId, discordTag);
            } else {
                registerChannel.send(`<@${discordId}>, there is no session running !`);
            }

        } else if (cmd === "totaltime") {

            if(channel.id != generalChannel.id){
                sendWrongChannelEmbed(channel, `${generalChannel}` ,discordId);
                return;
            }

            checkSessionTotalTime(discordId, discordTag);

        } else if (cmd.includes("totaltime ")) {

            if (channel.id != adminChannel.id) {
                sendWrongChannelEmbed(channel, `${adminChannel}`, discordId);
                return;
            }
            var wantedUser = cmd.split(" ")[1];
            if (wantedUser == undefined) {
                adminChannel.send(`<@${discordId}>, please use !bgc totaltime <student id / @user>.`);
            } else if (wantedUser.includes("@")) {
                //get total time by @ tag
                if (wantedUser.includes("!") && wantedUser.includes(">")) {
                    wantedUser = wantedUser.split("!")[1].split(">")[0];
                    var userTag = client.users.resolve(wantedUser).tag;

                    sendTotalTimeByDiscordTag(adminChannel, userTag);
                } else {
                    adminChannel.send(`<@${discordId}>, unknown user !`);
                }
            } else if (/^\d+$/.test(wantedUser)) {
                //get total time by student id
                sendTotalTimeByStudentId(adminChannel, parseInt(wantedUser));
            } else {
                adminChannel.send(`<@${discordId}>, please use !bgc totaltime <student id / @user>.`);
            }

        } else if (cmd === "dailytime") {

            if(channel.id != generalChannel.id){
                sendWrongChannelEmbed(channel, `${generalChannel}`,discordId);
                return;
            }

            checkSessionDailyTime(discordId, discordTag);


        } else if (cmd.includes("showallusers") || cmd.includes("showallsessions")) {

            if(channel.id != adminChannel.id){
                sendWrongChannelEmbed(channel, `${adminChannel}`,discordId);
                return;
            }

            var page = cmd.split(" ")[1];


            if (page == undefined) {

                if (cmd.includes("showallusers")) {
                    adminChannel.send(`<@${discordId}>, please use !bgc showallusers <page>.`);
                } else {
                    adminChannel.send(`<@${discordId}>, please use !bgc showallsessions <page>.`);
                }


            } else {

                let isnum = /^\d+$/.test(page);

                if (isnum) {

                    var pageNumber = parseInt(page);

                    if (pageNumber <= 0) {

                        adminChannel.send(`<@${discordId}>, please use numbers > 0 !`);
                        return;
                    }

                    if (cmd.includes("showallusers")) {
                        printUserDb(pageNumber);
                    } else {
                        printSessionDb(pageNumber);
                    }


                } else {
                    adminChannel.send(`<@${discordId}>, that is not a number !`);
                }



            }


        } else if (cmd === "help") {

            if (channel.id == welcomeChannel.id || channel.id == registerChannel.id){
                sendWrongChannelEmbed(channel, `${generalChannel}`,discordId);
                return;
            }

            printHelp(channel, discordId);
            
            } else if (cmd === "forceRegister") {
            registerUsers.push(new RegisterUser(user));
        }

    }





});

client.on('guildMemberAdd', member => {

    var user = member.user;


    registerUsers.push(new RegisterUser(user));

});



client.login(config.Bot.botToken);
initSql();