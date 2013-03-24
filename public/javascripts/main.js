var pageReady = false;
var currentFacebookId = null;

var finalPostList = null;
var finalPostMap = {};

function login(callback) {
    FB.login(function(response) {
        if (response.authResponse) {
            console.log("FB User logged in. Response:",response);
            callback(response);
        } else {
            // cancelled
        }
    }, {scope: 'read_stream, publish_stream'});
}

var template = '\
<tr id="{{postId}}">\
  <td><img src="{{{image-url}}}"></td>\
  <td><strong>{{from}}</strong><br>{{message}}\
      {{#needsSomething}}<br>\
      <ul>\
        {{#needsLike}}<li>Going to like it! (<a href="#" class="disableLike">x</a>)</li>{{/needsLike}}\
        {{#needsComment}}<li>Going to post \'{{comment}}\' (<a href="#" class="disableComment">x</a>)</li>{{/needsComment}}\
      <ul>\
      {{/needsSomething}}\
      </td>\
</tr>\
'

var commentTemplates = [
  "Thank you so much {{name}}!",
  "Cheers {{name}}!",
  "Thank you {{name}}!",
  "Muchos gracias {{name}}!",
  "Very much appreciated {{name}}, thank you!",
  "Thanks {{name}}!"];

var corrections = {
  "George Shan Lyons" : "Shan",
  "Helen Zipora Creeger" : "smell"
}

function yankFirstName(fullName) {
  if (corrections[fullName]) {
    return corrections[fullName]
  } else {
    var result = fullName;
    var firstSpace = fullName.indexOf(' ')
    if (firstSpace > -1) {
      result = fullName.substring(0,firstSpace);
    }
    return result;
  }
}

function chooseRandomTemplate() {
  var index = Math.floor(Math.random() * commentTemplates.length);
  return commentTemplates[index];
}

function isFBUserInCommentsOrLikesInfo(commentsOrLikes, userId) {
  var result = false;
  if (commentsOrLikes && commentsOrLikes.count > 0) {
    for(var i = 0;i<commentsOrLikes.data.length; i++) {
      var item = commentsOrLikes.data[i];
      if (item.from && item.from.id == userId) {
        return true;
      }
      if (item.id == userId) {
        return true;
      }
    }
  }
  return result;
}

function augmentPostsWithOtherInfo(posts) {
  $.each(posts, function(i, post) {
    var needsLike = !isFBUserInCommentsOrLikesInfo(post.likes, currentFacebookId);
    var needsComment = !isFBUserInCommentsOrLikesInfo(post.comments, currentFacebookId);
    var needsSomething = needsComment || needsLike;

    var data = {
      needsLike : needsLike,
      needsComment : needsComment,
      needsSomething : needsSomething,
    }
    post['tbh-data'] = data;
    // console.log("Message",post.message,"needsLike", needsLike, "needsComment",needsComment);
  })
}

function loginCompleted(response) {
  currentFacebookId = response.authResponse.userID;
  //Get list of posts on wall
  getBirthdayPostsOnWall(response, function(posts) {
    augmentPostsWithOtherInfo(posts);
    // console.log("Got posts:",$.map(posts,function(post, i){return post.message}));
    var summary = "You have " + posts.length + " of them."
    $("#summary").text(summary);
    if (posts.length > 0) {
      $(".do-comments-and-likes").show();
    }
    var container = $("#birthday-posts");
    $.each(posts, function(i, post) {
      
      var tbhData = post['tbh-data'];
      
      var comment;
      if (tbhData.needsComment) {
        var commentTemplate = chooseRandomTemplate();
        var name = yankFirstName(post.from.name);
        comment = Mustache.render(commentTemplate, {name:name});
        tbhData['comment'] = comment;
      }         
      
      var data = {
        'image-url': "http://graph.facebook.com/" + post.from.id + "/picture",
        from : post.from.name,
        message : post.message,
        needsSomething : tbhData.needsSomething,
        needsLike : tbhData.needsLike,
        needsComment : tbhData.needsComment,
        comment : comment,
        postId : post.id
      };

      var postRow = Mustache.to_html(template, data);
      var $postRow = $(postRow);
      if (!tbhData.needsSomething) {
        $postRow.css("opacity",0.3)
      }
      $postRow.find(".disableLike, .disableComment").data("fbPostId", post.id);
      $postRow.appendTo(container);
    });
    $(".disableLike").on("click", function(evt) {
      evt.preventDefault();
      var postId = $(evt.target).data("fbPostId")
      var post = finalPostMap[postId];
      console.log("disableLike.click: Got post",post);
      post["tbh-data"].needsLike = false;
      $(evt.target).closest("li").fadeTo(400,0.3)
    });
    $(".disableComment").on("click", function(evt) {
      evt.preventDefault();
      var postId = $(evt.target).data("fbPostId")
      var post = finalPostMap[postId];
      console.log("disableComment.click: Got post",post);
      post["tbh-data"].needsComment = false;
      $(evt.target).closest("li").fadeTo(400,0.3)
    });

    finalPostList = posts;    
  });
}

function getBirthdayPostsOnWall(response, callback) {
  //TODO: Get birthday, check for within last 24 hours
  console.log("Getting posts on wall");
  FB.api('me/feed?limit=150', function(response) {
    var posts = response.data;
    var birthdayPosts = $.grep(posts, function(post, i) {
      if (post.message && post.to) {
        // if ()
        var from = post.from.name;
        var log = false;
        var message = post.message;
        if (log) console.log("Processing message: '", message.toLowerCase(), "' from", from); 
        var filters = ['happy','birthday','bday','feliz','wishes'];
        for(var j = 0; j<filters.length; j++) {          
          var filter = filters[j];
          if (log) {console.log("Processing filter:", filter)}
          if (log) {console.log("indexOf:", message.toLowerCase().indexOf(filter))}  
          if (message.toLowerCase().indexOf(filter) > -1) {
            finalPostMap[post.id] = post
            return true;
          }
        }
        console.log("Discarding message: '", message, "' from", from);        
      }         
      return false;
    });
    console.log("Got",birthdayPosts.length, 'birthday posts from a total of', posts.length,'posts');
    callback(birthdayPosts);   
  });
}

function hasPermissions(permissions, callback) {
  FB.api('/me/permissions', function (response) {
    console.log('Permission response', response);
    var perms = response.data[0];
    var result = true;
    $.each(permissions,function(i, permission) {
      if (perms[permission]) {
        result = result && true;
      } else {
        result = false;
      }
    });
    callback(result);
  });
}

window.fbAsyncInit = function() {
  var isLocal = window.location.hostname.indexOf('local.birthdayhelper.com')  > -1;
  console.log("isLocal",isLocal);
  var appId = isLocal ? '525100497552814' : '495905673807221'
  var channelUrl = isLocal ? '//local.birthdayhelper.com/channel.html' : '//shrouded-hollows-1864.herokuapp.com/channel.html'
  FB.init({
    appId      : appId,
    channelUrl : channelUrl,
    status     : true, // check login status
    cookie     : true, // enable cookies to allow the server to access the session
    xfbml      : true  // parse XFBML
  });

  fbReady = true;

  FB.getLoginStatus(function(response) {
    if (response.status === 'connected') {
      console.log("FB User already logged in. Response:",response);
      hasPermissions(['read_stream','publish_stream'], function(result) {
        if (result) {
          loginCompleted(response);
        } else {
          login(loginCompleted);
        }
      });
      // connected
    } else if (response.status === 'not_authorized') {
      // not_authorized
      login(loginCompleted);
    } else {
      // not_logged_in
      login(loginCompleted);
    }
  });
};

// Load the SDK Asynchronously
(function(d){
  var js, id = 'facebook-jssdk', ref = d.getElementsByTagName('script')[0];
  if (d.getElementById(id)) {return;}
  js = d.createElement('script'); js.id = id; js.async = true;
  js.src = "//connect.facebook.net/en_US/all.js";
  ref.parentNode.insertBefore(js, ref);
 }(document));

function doCommentsAndLikes() {
  //TODO: iterate each post
  var doneMap = {};
  var count = 0
  var kState = "at-least-one-finished"
  $.each(finalPostList, function(i, post){
    var tbhData = post['tbh-data'];
    var postId = post.id;
    if (tbhData.needsSomething) {
      var baseUrl = postId + "/";
      if (tbhData.needsComment) {
        var comment = tbhData.comment;
        var neededComment = tbhData.needsComment;
        var neededLike = tbhData.needsLike;
        console.log("About to post comment:", comment, "on post",post.message)
        var url = baseUrl + "comments"
        var data = {message : comment};
        FB.api(url, 'post', data, function(response) {
          if (!response || response.error) {
            if (!response) {
              console.log("Failed to get response object when commenting on post", postId, "from", post.from.name);
            } else {
              console.log("Got error when commenting on post", postId, "from", post.from.name, ":", response.error);
            }
            $("#" + postId).css("color","red")            
          } else {
            if (!neededLike || doneMap[postId] == kState) {
              //complete
              $("#" + postId).fadeTo(400, 0.3);
            }
            doneMap[postId] = kState;
            tbhData.needsComment = false;
          }
        })
      }
      if (tbhData.needsLike) {
        console.log("About to like post:", post.message)
        var url = baseUrl + "likes"
        //Start callback
        FB.api(url, 'post', function(response) {
          if (!response || response.error) {
            if (!response) {
              console.log("Failed to get response object when liking post", postId, "from", post.from.name);
            } else {
              console.log("Got error when liking post", postId, "from", post.from.name, ":", response.error);
            }            
            $("#" + postId).css("color","red")                        
          } else {
            if (!neededComment || doneMap[postId] == kState) {
              //complete
              $("#" + postId).fadeTo(400, 0.3);
            }
            doneMap[postId] = kState;
            tbhData.needsLike = false;
          }
        });
      }
    }
  })
}

$(function () {
  pageReady = true;
  $(".do-comments-and-likes").on('click', doCommentsAndLikes);
});