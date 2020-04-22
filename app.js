var express = require('express'),
    {google} = require('googleapis'),
    urlParser = require('url'),
    bodyParser = require('body-parser'),
    calendar = google.calendar("v3");



var app = express()
app.use(express.static('public'));
app.set("view engine","ejs");
app.set('json spaces', 4)
app.use(bodyParser.urlencoded({extended:true}));



//Genrating an authentical URL


const oauth2Client = new google.auth.OAuth2(

	"668708568014-dkfj7i8vreg57ahtk9d3hf7u3vdbvsnv.apps.googleusercontent.com",
	"NiXggkHTfV5wt1-2VgY616Bm",
	"https://plannerc.herokuapp.com/google/authenticated//"
)

const scopes = [
  'Profile',
  'https://www.googleapis.com/auth/calendar',
  //'https://mail.google.com/'
];

const url = oauth2Client.generateAuthUrl({

  access_type: 'offline',
  scope: scopes
});






var events_global ;
var name ;
var picture_url ;

app.get("/",async function(req,res){
	res.render("login",{url:url});

  

})


//Getting Refresh Token
app.get("/google/authenticated",function(req,res){

	var code = req.query.code;
	console.log(code);
	oauth2Client.getToken(code, async function (err, tokens) {
 	
  	if (!err) {
    oauth2Client.setCredentials(tokens);
        var oauth2 = google.oauth2({
  auth: oauth2Client,
  version: 'v2'
  });
				 await oauth2.userinfo.get(
      function(err, res) {
    if (err) {
       console.log(err);
    } else {
       var user  =res.data;
       name =user['name'];
       console.log(name);
       picture_url = user['picture']
    }
  });




        res.redirect("/profile");
  			}
	});
})



app.get("/profile",async function(req,res){

  var events = await listEvents(oauth2Client);
	res.render("profile",{events:events,name:name,picture_url:picture_url});
  events_global = events;
  
  



  
})


app.get('/sendevent',async function(req,res){

  var index  = parseInt(req.query['id']);
  res.render('sendevent',{event:events_global[index],name:name,picture_url:picture_url});

})


app.post('/sendevent',async function(req,res){

  var event =req.body.event;
  var eventId = event['id'];
  var newEmail = event['email'].split(",");


  var response = await sendInvite(oauth2Client,newEmail,eventId);
  res.redirect('/profile')
})

app.get('/eventsjson',  async function(req,res){

	res.json(events_global);
})


app.get('/addevents',function(req,res){

		res.render("addEvents",{name:name,picture_url:picture_url});
})
app.post('/addevents',function(req,res){

  res.render('addEvents',{name:name,picture_url:picture_url});
  var eventDetails = req.body.event;
  var attendeDetails = req.body.event['email'].split(',');
  
  var attendees = new Array();
  for (var i = 0 ; i<attendeDetails.length;i++)
  {
      var attende  = new Object();

      attende['email'] = attendeDetails[i];
      attendees.push(attende);
  }

  console.log(Date.parse(eventDetails['start']));
	var event = {
    'summary':eventDetails['title'],
    'description':eventDetails['body'],
    'attendees':attendees,
    'start':{
      'dateTime' :eventDetails['start']+"T00:00:00+05:30"
    },
    'end':{
      'dateTime':eventDetails['end']+"T24:00:00+05:30"
    }
	}


  addEvents(oauth2Client,event);

})



 function addEvents(auth,event){


	calendar.events.insert({
	  auth: auth	,
	  calendarId: 'primary',
	  resource: event,
    sendNotifications:true
	}, function(err, event) {
	  if (err) {
	    console.log('There was an error contacting the Calendar service: ' + err);
	    return;
	  }
	  console.log('Event created: %s', event);
	  console.log(event);
	});

}


async function listEvents(auth) {
  const calendar =  google.calendar({version: 'v3', auth});
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


async function sendInvite(auth ,newEmail,id) {
    const calendar =  google.calendar({version: 'v3', auth});
    var res = await calendar.events.get({
    calendarId: 'primary',
    eventId:id
    
  });


    if(typeof(res.data['attendees'])=='undefined')
    {
      res.data['attendees'] = new Array();
      console.log(res.data['attendees']);
    }
   for(var i=0;i<newEmail.length;i++)
   {
    res.data['attendees'].push({'email':newEmail[i]});
   }
   
 
  
  var request = await calendar.events.patch({
   
   calendarId: 'primary',
    eventId:id,
      resource:{
        
        attendees :res.data['attendees']
        
      },
      sendUpdates:'all'
  })
}




app.listen(process.env.IP,"3000",function(){
	console.log("Server Started");
})
