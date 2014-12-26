if (typeof window.console === "undefined") window.console = {};
if (typeof window.console.log === "undefined" || !window.console.log) window.console.log = function() {};

var pageReady = false;
var currentFacebookId = null;

var finalPostList = null;
var finalPostMap = {};
var disabledLikes = initLocalStorageItem("disabledLikes");
var disabledComments = initLocalStorageItem("disabledComments");
var peopleInfo = initLocalStorageItem("peopleInfo");

var defaultCommentTemplates = [
  "Thank you so much {{name}}!",
  "Thank you so much {{name}}!!",
  "Thank you so much {{name}} :-)",
  "Cheers {{name}}!",
  "Cheers {{name}}!!",
  "Thank you {{name}}!",
  "Thank you {{name}}! :-)",
  "Muchos gracias {{name}}!",
  "Muchos gracias {{name}}!!",
  "{{name}}, you rock. Thank you!",
  "Thanks {{name}}!",
  "Thanks {{name}}!!"
];
var commentTemplates = initLocalStorageItem("commentTemplates", defaultCommentTemplates);

function initLocalStorageItem(key, defaultVal) {
  var itemFromStorage = window.localStorage.getItem(key);
  if (itemFromStorage) {
    return JSON.parse(itemFromStorage)
  } else {
    return defaultVal || {}
  }
}

function updateLocalStorageMap(key, map) {
  window.localStorage.setItem(key, JSON.stringify(map));
}

//Likes and Comments
function isLikeDisabledForPost(postId) {
  return isActionDisabledForPost(disabledLikes, postId);
}

function isCommentDisabledForPost(postId) {
  return isActionDisabledForPost(disabledComments, postId);
}

function isActionDisabledForPost(actionMap, postId) {
  if (actionMap[postId]) return true;
  return false;
}

function updateDisabledLikes(postId, value) {
  disabledLikes[postId] = value;
  updateLocalStorageMap('disabledLikes', disabledLikes);
}

function updateDisabledComments(postId, value) {
  disabledComments[postId] = value;
  updateLocalStorageMap('disabledComments', disabledComments);
}

function updateCommentTemplates(newCommentTemplates) {
  commentTemplates = newCommentTemplates;
  updateLocalStorageMap('commentTemplates', newCommentTemplates);
}

//peopleInfo
function setNickname(userId, newValue) {
  var personInfo = peopleInfo[userId];
  if (newValue === "" || newValue === null) {
    if (personInfo && personInfo['nickname']) {
      delete personInfo['nickname'];
    }
  } else {
    personInfo = personInfo || {};
    personInfo['nickname'] = newValue
  }
  if (personInfo) {
    peopleInfo[userId] = personInfo;
    updateLocalStorageMap("peopleInfo", peopleInfo);
  }
}

function clearNickname(userId) {
  setNickname(userId, null);
}

function getNickname(userId) {
  var personInfo = peopleInfo[userId];
  var result = null
  if (personInfo && personInfo.nickname) {
    result = personInfo.nickname
  }
  return result;
}

var PERMS = ['read_stream', 'email', 'publish_actions']

function login(callback) {
    FB.login(function(response) {
        if (response.authResponse) {
            //console.log("FB User logged in. Response:",response);
            trackAnalyticsEvent('Facebook login completed');
            callback(response, false);
        } else {
          trackAnalyticsEvent('Facebook login cancelled');
        }
    }, {scope: PERMS.join(',')});
}

var template = '\
<div class="row postRow" id="{{postId}}">\
  <div class="span1"><img class="no-resize" src="{{{image-url}}}"></div>\
  <div class="span7"><strong>{{from}}</strong>\
    <span class="nickname-info">\
      <a href="#" class="nickname-button edit-nickname">not what you call this person?</a>\
      <span class="nickname-textbox">also known as <span class="input-append"><input type="text"><button class="btn btn-mini confirm-nickname-edit" type="button"><i class="icon-ok"></i></button><button class="btn btn-mini cancel-nickname-edit" type="button"><i class="icon-remove"></i></button></span></span>\
      <span class="nickname-aka">\
        also known as <strong><span class="nickname-value"></span></strong>\
        <span class="btn-group">\
          <button class="btn btn-mini edit-nickname"><i class="icon-pencil"></i></button>\
          <button class="btn btn-mini remove-nickname"><i class="icon-trash"></i></button>\
        </span>\
      </span>\
    </span>\
    <br>{{message}}\
    {{#needsSomething}}<br>\
    <ul>\
      {{#needsLike}}<li class="likeAction">Like this post! <a title="Don\'t like this post" href="#" class="disableLike disableAction"><i class="icon-ban-circle"></i></a></li>{{/needsLike}}\
      {{#needsComment}}<li class="commentAction">Add a comment: \'<span class="comment-value">{{comment}}</span>\' <a title="Don\'t post this comment" href="#" class="disableComment disableAction"><i class="icon-ban-circle"></i></a></li>{{/needsComment}}\
    <ul>\
    {{/needsSomething}}\
  </div>\
<div>\
'

var commentTemplateListTemplate = '\
{{#templates}}\
<div class="edit-comment-template">\
  <span class="input-append"><input data-original="{{.}}" type="text" value="{{.}}"><button class="btn btn-mini reset-template"><i class="icon-undo"></i></button><button class="btn btn-mini remove-template"><i class="icon-trash"></i></button></span>\
</div>\
{{/templates}}\
'

function yankFirstName(user) {
  var nickname = getNickname(user.id);
  if (nickname) {
    return nickname;
  } else {
    var result = user.name;
    var firstSpace = result.indexOf(' ')
    if (firstSpace > -1) {
      result = result.substring(0,firstSpace);
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
  if (commentsOrLikes && commentsOrLikes.data && commentsOrLikes.data.length > 0) {
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

    var data = {
      needsLike : needsLike,
      needsComment : needsComment
    }
    // var data = {
    //   needsLike : true,
    //   needsComment : false
    // }
    post['tbh-data'] = data;
    // console.log("Message",post.message,"needsLike", needsLike, "needsComment",needsComment);
  })
}

function toggleNicknameControls($postRow, showTextbox, showNickname) {
  $postRow.toggleClass("editing-nickname", showTextbox)
          .toggleClass("has-nickname", showNickname); 
}
//TODO: Call this from a more generic formatPostRow method
function formatNicknameInfo($postRow, post) {
    //if there is a nickname, show the has-nickname section, populating the nickname
    var nickname = getNickname(post.from.id);
    if (nickname) {
      $postRow.find(".nickname-value").text(nickname);
      $postRow.find(".nickname-textbox input").val(nickname)
      toggleNicknameControls($postRow, false, true);
    } else {
      $postRow.find(".nickname-textbox input").val("")
      toggleNicknameControls($postRow, false, false);
    }
}

function createCommentForPost(post) {
  var commentTemplate = post['tbh-data']['comment-template'];
  var name = yankFirstName(post.from);
  return Mustache.render(commentTemplate, {name:name});
}

function updateCommentTemplateForPost(post) {
  var commentTemplate = chooseRandomTemplate();
  var tbhData = post['tbh-data'];
  tbhData['comment-template'] = commentTemplate;
  comment = createCommentForPost(post);
  tbhData['comment'] = comment;
  return comment;
}

function addPostsToPage(posts) {
  var container = $("#birthday-posts");
  container.empty();
  $.each(posts, function(i, post) {

    var tbhData = post['tbh-data'];

    var comment;
    if (tbhData.needsComment) {
      comment = updateCommentTemplateForPost(post);
    }

    var data = {
      'image-url': "http://graph.facebook.com/" + post.from.id + "/picture",
      from : post.from.name,
      message : post.message,
      needsSomething : tbhData.needsLike || tbhData.needsComment,
      needsLike : tbhData.needsLike,
      needsComment : tbhData.needsComment,
      comment : comment,
      postId : post.id
    };

    var postRow = Mustache.to_html(template, data);
    var $postRow = $(postRow);
    if (!data.needsSomething) {
      $postRow.addClass("no-action-required");
    } else {
      var markActionAsDisabled = function (actionType) {
        $postRow.find("." + actionType + "Action").addClass("no-action-required");
      }

      if (isLikeDisabledForPost(post.id)) {
        markActionAsDisabled('like');
      }
      if (isCommentDisabledForPost(post.id)) {
        markActionAsDisabled('comment');
      }
    }
    $postRow.find(".disableLike, .disableComment").data("fbPostId", post.id);
    formatNicknameInfo($postRow, post);
    $postRow.data("fbPostId", post.id);
    $postRow.appendTo(container);
  });
}

function loginCompleted(response, remembered) {
  currentFacebookId = response.authResponse.userID;
  //TODO: Grab name, email
  FB.api("/me",{fields:"name,email"}, function(response) {
    if (response && !response.error) {
      var traits = {
        name: response.name,
        email: response.email
      }
      identifyAnalyticsUser(currentFacebookId, traits)
    }
  });
  trackAnalyticsEvent("User logged in", {remembered: !!remembered})
  $("#not-logged-in").fadeOut('fast', function() {
    $("#logged-in").fadeIn('fast');
  });
  //Get list of posts on wall
  getBirthdayPostsOnWall(response, function(posts) {
    augmentPostsWithOtherInfo(posts);
    // console.log("Got posts:",$.map(posts,function(post, i){return post.message}));
    if (posts.length === 0) {
      $("#getting-birthday-posts").fadeOut(function() {
        $(".got-no-birthday-posts").fadeIn();
        trackAnalyticsEvent("User had no birthday posts")
      });
    } else {
      trackAnalyticsEvent("User had some birthday posts", {"number_birthday_posts": posts.length})
      var summary = "You have " + posts.length + " of them."
      $("#getting-birthday-posts").fadeOut(function() {
        $(".do-comments-and-likes").show();
        $(".got-birthday-posts").fadeIn();
        $("#summary").text(summary);
      });
    }
    addPostsToPage(posts);

    var disableAction = function(evt, getter, setter) {
      evt.preventDefault();
      var $target = $(evt.currentTarget);
      var postId = $target.data("fbPostId")
      var existingValue = getter(postId);
      var newValue = !existingValue;
      setter(postId, newValue)
      var opacity = newValue ? 0.3 : 1.0
      $target.closest("li").fadeTo(400,opacity)
    }

    //TODO: Use a context to make this more efficient.
    $(".disableLike").on("click", function(evt) {
      disableAction(evt, isLikeDisabledForPost, updateDisabledLikes);
    });
    $(".disableComment").on("click", function(evt) {
      disableAction(evt, isCommentDisabledForPost, updateDisabledComments);
    });

    var updateComment = function($postRow, post) {
        if (post['tbh-data'].needsComment) {
          var comment = createCommentForPost(post);
          $postRow.find(".comment-value").text(comment);
          post['tbh-data'].comment = comment;
        }
    }
    var container = $("#birthday-posts");
    container.on("click", ".remove-nickname", function(evt) {
      evt.preventDefault();
      var $postRow = $(this).closest('.postRow');
      var postId = $postRow.data("fbPostId");
      var post = finalPostMap[postId];
      var fromUserId = post.from.id;

      clearNickname(fromUserId);
      formatNicknameInfo($postRow, post);
      updateComment($postRow, post);
    });

    container.on("click",".edit-nickname", function(evt) {
      evt.preventDefault();
      var $this = $(this);
      var $postRow = $this.closest('.postRow');
      var postId = $postRow.data("fbPostId");
      var post = finalPostMap[postId];
      var fromUserId = post.from.id;

      var showTextbox = true, showNickname = false
      toggleNicknameControls($postRow, showTextbox, showNickname);

      var $textbox = $postRow.find(".nickname-textbox input")

      var updateNickname = function () {
        $postRow.off('.tbh-nickname');
        //get value from text box
        var newNickname = $.trim($textbox.val());
        if (newNickname === "") {
          clearNickname(fromUserId);
        } else {
          setNickname(fromUserId, newNickname);
        }
        formatNicknameInfo($postRow, post);
        updateComment($postRow, post);
      }

      $textbox.on('keydown.tbh-nickname', function (evt) {
        if (evt.keyCode === 13) {
          updateNickname();
        }
      });
      $postRow.find(".confirm-nickname-edit").on('click.tbh-nickname', updateNickname);
      $postRow.find(".cancel-nickname-edit").on('click.tbh-nickname', function() {

        $postRow.off('.tbh-nickname');
        formatNicknameInfo($postRow, post);
      });

      $textbox.focus()
    })

    finalPostList = posts;
  });
}

function getBirthdayPostsOnWall(response, callback) {
  //TODO: Get birthday, check for within last 24 hours
  console.log("Getting posts on wall");
  FB.api('me/feed?limit=150', function(response) {
    var posts = response.data;
    var birthdayPosts = $.grep(posts, function(post, i) {
      try {
        if (post.message && post.to && post.to.data && post.to.data.length > 0 && post.to.data[post.to.data.length - 1].id === currentFacebookId && post.from.id !== currentFacebookId) {
          var from = post.from.name;
          var log = false;
          var message = post.message;
          if (log) console.log("Processing message: '", message.toLowerCase(), "' from", from); 
          var filters = ['happy','birthday','bday','feliz','wishes', 'hbty', 'hbd', 'great day','wonderful day', 'awesome day', 'fantastic day'];
          for(var j = 0; j<filters.length; j++) {
            var filter = filters[j];
            if (log) {console.log("Processing filter:", filter)}
            if (log) {console.log("indexOf:", message.toLowerCase().indexOf(filter))}  
            if (message.toLowerCase().indexOf(filter) > -1) {
              finalPostMap[post.id] = post;
              return true;
            }
          }
          console.log("Discarding message: '", message, "' from", from);
        }
        return false;
      } catch (err) {
        console.log("An error occured whilst processing post",post,":", err);
        return false;
      }
    });
    console.log("Got",birthdayPosts.length, 'birthday posts from a total of', posts.length,'posts');
    callback(birthdayPosts);
  });
}

function hasPermissions(permissions, callback) {
  FB.api('/me/permissions', function (response) {
    var perms = response.data;
    var permsObj = {};
    $.each(perms, function(i, fb_perm) {
      permsObj[this.permission] = this.status === "granted";
    });
    var result = true;
    $.each(permissions,function(i, permission) {
      if (permsObj[permission] === true) {
        result = result && true;
      } else {
        result = false;
      }
    });
    callback(result);
  });
}

function showLoginButton() {
  $("#not-logged-in").fadeIn('fast');
}

function isLocalEnv() {
  return window.location.hostname.indexOf('local.thebirthdayhelper.com')  > -1;
}

function isTestMode() {
  return window.location.search.indexOf('test=true') > -1;
}

window.fbAsyncInit = function() {
  var isLocal = isLocalEnv();
  var appId = isLocal ? '815370921860693' : '495905673807221'
  FB.init({
    appId      : appId,
    status     : true, // check login status
    cookie     : true, // enable cookies to allow the server to access the session
    xfbml      : true,  // parse XFBML
    version    : 'v2.1'
  });

  fbReady = true;

  FB.getLoginStatus(function(response) {
    if (response.status === 'connected') {
      console.log("FB User already logged in. Response:",response);
      hasPermissions(PERMS, function(result) {
        if (result) {
          loginCompleted(response, true);
        } else {
          showLoginButton();
        }
      });
      // connected
    } else if (response.status === 'not_authorized') {
      // not_authorized
      showLoginButton();
    } else {
      // not_logged_in
      showLoginButton();
    }
  });
};

// Load the SDK Asynchronously
(function(d, s, id){
  var js, fjs = d.getElementsByTagName(s)[0];
  if (d.getElementById(id)) {return;}
  js = d.createElement(s); js.id = id;
  js.src = "//connect.facebook.net/en_US/sdk.js";
  fjs.parentNode.insertBefore(js, fjs);
}(document, 'script', 'facebook-jssdk'));

function doCommentsAndLikes(doComments) {
  var doneMap = {};
  var count = 0
  var kState = "at-least-one-finished"
  var markPostRowAsComplete = function($postRow) {
    $postRow.find(".disableAction").hide();
    $postRow.fadeTo(400, 0.3);
  }

  $.each(finalPostList, function(i, post){
    var tbhData = post['tbh-data'];
    var postId = post.id;
    var neededComment = tbhData.needsComment;
    var neededLike = tbhData.needsLike;

    if (tbhData.needsComment || tbhData.needsLike) {
      var baseUrl = postId + "/";
      if (doComments & tbhData.needsComment && !isCommentDisabledForPost(postId)) {
        var comment = tbhData.comment;
        var url = baseUrl + "comments"
        var data = {message : comment};
        if (isTestMode()) {
          console.log("TEST MODE: Would have posted comment '%s' on post '%s'",data.message,post.message);
        } else {
          FB.api(url, 'post', data, function(response) {
            if (!response || response.error) {
              if (!response) {
                console.log("Failed to get response object when commenting on post", postId, "from", post.from.name);
              } else {
                console.log("Got error when commenting on post", postId, "from", post.from.name, ":", response.error);
                trackAnalyticsEvent("Error occured",{message:response.error,action:'comment'});
              }
              $("#" + postId).css("color","red");
            } else {
              if (!neededLike || doneMap[postId] == kState) {
                //complete
                markPostRowAsComplete($("#" + postId));
              }
              doneMap[postId] = kState;
              tbhData.needsComment = false;
            }
          });
        }
      }
      if (tbhData.needsLike && !isLikeDisabledForPost(postId)) {
        var url = baseUrl + "likes"
        //Start callback
        if (isTestMode()) {
          console.log("TEST MODE: About to like post: '%s'", post.message)
        } else {
          FB.api(url, 'post', function(response) {
            if (!response || response.error) {
              if (!response) {
                console.log("Failed to get response object when liking post", postId, "from", post.from.name);
              } else {
                console.log("Got error when liking post", postId, "from", post.from.name, ":", response.error);
                trackAnalyticsEvent("Error occured",{message:response.error,action:'like'});
              }
              $("#" + postId).css("color","red")
            } else if(!doComments && neededComment) {
              //not doing comments, and it needed one. Hide the 'ban icon' and gray the like action.
              tbhData.needsLike = false;
              var $postRow = $("#" + postId);
              $postRow.find(".disableLike").hide();
              $postRow.find(".likeAction").fadeTo(400, 0.3);
            } else {
              if (!neededComment || doneMap[postId] == kState) {
                //complete
                markPostRowAsComplete($("#" + postId));
              }
              doneMap[postId] = kState;
              tbhData.needsLike = false;
            }
          });
        }
      }
    }
  });
}

function ensureAnalytics(callback) {
  if (analytics) {
    callback(analytics);
  }
}

function trackAnalyticsEvent(name, props) {
  props = props || {};
  // ensureKiss(function (kiss){
  //   kiss.push(['record', name, props])
  // });
  // ensureMixPanel(function(mixpanel) {
  //   mixpanel.track(name, props);
  // });
  ensureAnalytics(function (analytics) {
    analytics.track(name, props)
  });
}

function identifyAnalyticsUser(userId, traits) {
  // ensureKiss(function (kiss) {
  //   kiss.push(['identify', userId.toString()]);
  // });
  // ensureMixPanel(function(mixpanel) {
  //   mixpanel.register({"fb_id":userId});
  //   mixpanel.identify(userId);
  // }

  //TODO: Name
  ensureAnalytics(function (analytics) {
    analytics.identify(userId, traits);
  });
}

function transitionBlock(from, to, callback) {
  $(from).fadeOut("fast", function() {
    $(to).fadeIn("fast", callback);
  });
}

function createCommentTemplateListHtml(commentTemplates) {
  var data = {
    templates : commentTemplates
  }

  var templateListHtml = Mustache.to_html(commentTemplateListTemplate, data);
  var $templateListHtml = $(templateListHtml);
  return $templateListHtml;
}

function initCommentTemplateList(commentTemplates) {
  $("#comment-template-list").empty();
  var $templateListHtml = createCommentTemplateListHtml(commentTemplates);

  if (commentTemplates.length == 1) {
    $templateListHtml.find(".remove-template").addClass("disabled").prop("disabled", true);
  }

  $("#comment-template-list").append($templateListHtml);
}

$(function () {
  pageReady = true;
  $(".do-comments-and-likes").on('click', function() {trackAnalyticsEvent('Actioned comments and likes');doCommentsAndLikes(true)});
  $(".do-likes").on('click', function() {trackAnalyticsEvent('Actioned likes');doCommentsAndLikes(false)});
  var $customizeCommentsContainer = $(".customize-comments-view");

  // hide/show the reset-comment-template button
  $customizeCommentsContainer.on("keyup change", "input[type=text]", function() {
    var $this = $(this);
    var originalValue = $this.attr("data-original");
    var currentValue = $this.val();
    var $resetButton = $this.closest(".input-append").find(".reset-template");
    if (originalValue !== currentValue) {
      $resetButton.show();
      $resetButton.animate({width: '28px'}, 100);
    } else {
      $resetButton.animate({width: '0'}, 100, "swing", function() {
        $resetButton.hide();
      });
    }
  });

    //click handler for resetcomment-template button
  $customizeCommentsContainer.on("click", ".reset-template", function() {
    var $this = $(this);
    var $textBox = $this.closest(".input-append").find("input");
    var originalValue = $textBox.attr("data-original");
    $textBox.val(originalValue).trigger('keyup');
  });

  //click handler for remove/undo button
  $customizeCommentsContainer.on("click", ".remove-template", function() {
    var $this = $(this);
    var $containerDiv = $(this).closest(".edit-comment-template");
    var $textbox = $containerDiv.find("input");
    var isDeleted = $textbox.data("isDeleted") || false;
    var opacity = isDeleted ? 1 : 0.3;
    $textbox.fadeTo(400, opacity).data("isDeleted", !isDeleted).toggleClass("deleted");
    $textbox.prop("disabled", !isDeleted);
    $this.find("i").toggleClass("icon-trash icon-undo");

    // make sure they can't delete the last box.
    var commentTemplatesNotDeleted = $("#comment-template-list").find("input[type=text]").not(".deleted");
    var opacityForRemoveButton = commentTemplatesNotDeleted.length == 1 ? 0.3 : 1
    commentTemplatesNotDeleted.closest(".input-append").find(".remove-template").fadeTo(400, opacityForRemoveButton).prop("disabled", commentTemplatesNotDeleted.length == 1);
  });

  $(".customize-comments").on('click', function(evt) {
    evt.preventDefault();
    initCommentTemplateList(commentTemplates);

    transitionBlock(".posts-view", ".customize-comments-view", function() {
      $('html, body').animate({
           scrollTop: $(".customize-comments-view").offset().top
       }, 200);
    });
  });

  function leaveCustomizeCommentsView() {
    transitionBlock(".customize-comments-view", ".posts-view", function() {
      $("#comment-template-list").empty();
    });
  }

  $(".customize-comments-cancel").on("click", function() {
    leaveCustomizeCommentsView();
  });

  //save handler
  $(".customize-comments-save").on("click", function(){
    var templateListContainer = $("#comment-template-list");
    var textboxes = $(templateListContainer.find("input[type=text]").not(".deleted"));
    var newTemplateList = [];
    textboxes.each(function() {
      var template = $.trim($(this).val())
      if (template !== ""){
        newTemplateList.push(template);
      }
    });
    var listHasChanged = ($(commentTemplates).not(newTemplateList).length != 0 || $(newTemplateList).not(commentTemplates).length != 0);

    if (listHasChanged) {
      updateCommentTemplates(newTemplateList);
      addPostsToPage(finalPostList);
    }

    leaveCustomizeCommentsView();
  });

  //restore default comment template click handler
  $(".customize-comments-restore-defaults").on("click", function () {
    initCommentTemplateList(defaultCommentTemplates);
  });

  //add template button handler
  $(".customize-comments-add-template").on("click", function() {
    var $commentTemplateHtml = createCommentTemplateListHtml(['']);
    $("#comment-template-list").append($commentTemplateHtml);
  });

  $("#fb-login").on('click', function(evt) {
    evt.preventDefault();
    trackAnalyticsEvent('Facebook login started');
    login(loginCompleted);
  });
});