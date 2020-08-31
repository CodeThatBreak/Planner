var express = require('express'),
    {google} = require('googleapis'),
    urlParser = require('url'),
    bodyParser = require('body-parser'),
    session = require('express-session'),
    calendar = google.calendar("v3");



var app = express()
app.set("view engine", "ejs");
app.set('json spaces', 4)

app.use(express.static('public'));
app.use(bodyParser.urlencoded({
    extended: true
}));


app.use(session({
    secret: process.env.SECRET,
    name: "sid",
    resave: false,
    saveUninitialized: true,
    cookie: { 
        secure: false,
        maxAge: 24*60*60*1000
    }
}));

const redirectLogin = (req, res, next) => {

    if (!req.session.tokens) {
        res.redirect('/')
    } else {
        next();
    }

}

const redirectHome = (req, res, next) => {
    

    if (req.session.tokens) {
       res.redirect('/profile')
    } else {
        next();
    }


}


//Genrating an authentical URL

function getOAuthClient(){
    return new google.auth.OAuth2(

    process.env.CLIENT_ID,
    process.env.CLIENT_SECRET,
    process.env.REDIRECT_URI
)}

function getUrl(){

    var oauth2Client =getOAuthClient();
    const scopes = [
        'Profile',
        'https://www.googleapis.com/auth/calendar',
        //'https://mail.google.com/'
    ];

    const url = oauth2Client.generateAuthUrl({

        access_type: 'offline',
        scope: scopes
    });

    return url;
}



app.get("/", redirectHome, async function(req, res) {

    var url = getUrl();

      res.render("login", {
          url: url
      });
})


//Getting Refresh Token
app.get("/google/authenticated",function(req, res) {

  

    var oauth2Client = getOAuthClient();
    var session = req.session;
    var code = req.query.code;
    oauth2Client.getToken(code, async function(err, tokens) {
      // Now tokens contains an access_token and an optional refresh_token. Save them.
      if(!err) {
        oauth2Client.setCredentials(tokens);
        var oauth2 = google.oauth2({
                auth: oauth2Client,
                version: 'v2'
            });
        var u = await oauth2.userinfo.get(
                async function(err, user) {
                    if (err) {
                        console.log(err);
                    } else {
                        var user = user.data;
                        req.session.tokens=tokens;
                        req.session.name=user['name'];  
                        req.session.picture_url=user['picture'];
                        req.session.save();
                        res.redirect("/profile");

                    }
                });
      }
      else{
      }
    });

})



app.get("/profile",redirectLogin, async function(req, res) {

       var oauth2Client = getOAuthClient();
       oauth2Client.setCredentials(req.session["tokens"]);
       var events = await listEvents(oauth2Client);
       res.render("profile", {
          events: events,
          name: req.session.name,
          picture_url: req.session.picture_url
       });
})


app.get('/sendevent',redirectLogin, async function(req, res) {

    var index = parseInt(req.query['id']);
    var oauth2Client = getOAuthClient();
    oauth2Client.setCredentials(req.session["tokens"]);
    var events = await listEvents(oauth2Client);
    res.render('sendevent', {
        event: events[index],
        name: req.session.name,
        picture_url: req.session.picture_url
    });

})


app.post('/sendevent', async function(req, res) {

    var event = req.body.event;
    var eventId = event['id'];
    var newEmail = event['email'].split(",");
    var oauth2Client = getOAuthClient();
    oauth2Client.setCredentials(req.session["tokens"]);
    var response = await sendInvite(oauth2Client, newEmail, eventId);
    res.redirect('/profile')
})

app.get('/eventsjson',redirectLogin, async function(req, res) {
    var oauth2Client = getOAuthClient();
    oauth2Client.setCredentials(req.session["tokens"]);
    var events = await listEvents(oauth2Client);
    res.json(events);
})


app.get('/addevents',redirectLogin, function(req, res) {

    res.render("addEvents", {
        name: req.session.name,
        picture_url: req.session.picture_url
    });
})
app.post('/addevents', function(req, res) {

    var oauth2Client = getOAuthClient();
    oauth2Client.setCredentials(req.session["tokens"]);
    var eventDetails = req.body.event;
    var attendeDetails = req.body.event['email'].split(',');

    var attendees = new Array();
    for (var i = 0; i < attendeDetails.length; i++) {
        var attende = new Object();

        attende['email'] = attendeDetails[i];
        attendees.push(attende);
    }

    console.log(Date.parse(eventDetails['start']));
    var event = {
        'summary': eventDetails['title'],
        'description': eventDetails['body'],
        'attendees': attendees,
        'start': {
            'date': eventDetails['start']
        },
        'end': {
            'date': eventDetails['end']
        }
    }
    addEvents(oauth2Client, event);
    res.redirect('/profile');

})

app.get('/logout',redirectLogin, redirectLogin, function(req, res) {

    req.session.destroy(err => {
        if (err) {
            res.redirect('/profile')
        }

        res.clearCookie('sid');
        res.redirect('/');
    })


});

function addEvents(auth, event) {


    calendar.events.insert({
        auth: auth,
        calendarId: 'primary',
        resource: event,
        sendNotifications: true
    }, function(err, event) {
        if (err) {
            console.log('There was an error contacting the Calendar service: ' + err);
            return;
        }
    });

}


async function listEvents(auth) {
    const calendar = google.calendar({
        version: 'v3',
        auth
    });
    const res = await calendar.events.list({
        calendarId: 'primary',
        timeMin: (new Date()).toISOString(),
        maxResults: 20,
        singleEvents: true,
        orderBy: 'startTime',
    });
    const events = res.data.items;
    return events;
}


async function sendInvite(auth, newEmail, id) {
    const calendar = google.calendar({
        version: 'v3',
        auth
    });
    var res = await calendar.events.get({
        calendarId: 'primary',
        eventId: id

    });


    if (typeof(res.data['attendees']) == 'undefined') {
        res.data['attendees'] = new Array();
        console.log(res.data['attendees']);
    }
    for (var i = 0; i < newEmail.length; i++) {
        res.data['attendees'].push({
            'email': newEmail[i]
        });
    }



    var request = await calendar.events.patch({

        calendarId: 'primary',
        eventId: id,
        resource: {
            attendees: res.data['attendees']
        },
        sendUpdates: 'all'
    })
}




app.listen(process.env.PORT || 3000, function() {
    console.log("Server Started");
})
