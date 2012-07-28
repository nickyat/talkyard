/* Copyright (c) 2010 - 2012 Kaj Magnus Lindberg. All rights reserved. */


(function() {

var d = { i: debiki.internal, u: debiki.v0.util };
var $ = d.i.$;


// Returns a user object, with functions refreshProps, getName,
// isLoggedIn, getLoginId and getUserId.
d.i.makeCurUser = function() {
  // Cache user properties — parsing the session id cookie over and
  // over again otherwise takes 70 - 80 ms on page load, but only
  // 2 ms when cached. (On my 6 core 2.8 GHz AMD, for a page with
  // 100 posts. The user id is checked frequently, to find out which
  // posts have the current user written.)
  var userProps;
  var emailPrefs = undefined;
  var emailSpecified = false;
  var permsOnPage = {};

  function refreshProps() {
    parseSidCookie();
    parseConfigCookie();
  }

  // Warning: Never use the user's name as html, that'd allow xss attacks.
  // (loginId and userId are generated by the server.)
  function parseSidCookie() {
    // sid example:
    //   Y1pBlH7vY4JW9A.23.11.Magnus.1316266102779.15gl0p4xf7
    var sid = $.cookie('dwCoSid');
    if (!sid) {
      userProps = { loginId: undefined, userId: undefined, name: undefined };
      return;
    }
    var arr = sid.split('.');
    userProps = {
      // [0] is a hash
      loginId: arr[1],
      userId: arr[2],
      name: arr[3].replace('_', '.')
      // [4] is login time
      // [5] is a random value
    };
  }

  function parseConfigCookie() {
    var val = $.cookie('dwCoConf');
    emailPrefs = undefined;
    emailSpecified = false;
    if (!val) return;
    if (val.indexOf('EmNtR') !== -1) emailPrefs = 'Receive';
    if (val.indexOf('EmNtN') !== -1) emailPrefs = 'DontReceive';
    if (val.indexOf('EmNtF') !== -1) emailPrefs = 'ForbiddenForever';
    if (val.indexOf('EmSp') !== -1) emailSpecified = true;
  }

  function fireLoginIfNewSession(opt_loginIdBefore) {
    // Sometimes an event object is passed instead of a login id.
    var loginIdBefore = typeof opt_loginIdBefore == 'string' ?
        opt_loginIdBefore : userProps.loginId;
    refreshProps();
    if (loginIdBefore !== userProps.loginId) {
      if (api.isLoggedIn()) api.fireLogin();
      else api.fireLogout();
      // If the login/logout happened in another browser tab:
      // COULD pop up a modal dialog informing the user that s/he has
      // been logged in/out, because of something s/he did in *another* tab.
      // And that any posts s/he submits will be submitted as the new user.
    }
  }

  /**
   * Clears e.g. highlightings of the user's own posts and ratings.
   */
  function clearMyPageInfo() {
    $('.dw-p-by-me').removeClass('dw-p-by-me');
    $('.dw-p-r-by-me').remove();
    permsOnPage = {};
  }

  /**
   * Highlights e.g. the user's own posts and ratings.
   *
   * Loads user specific info from the server, e.g. info on
   * which posts the current user has authored or rated,
   * and the user's permissions on this page.
   *
   * If, however, the server has already included the relevant data
   * in a certain hidden .dw-data-yaml node on the page, then use
   * that data, but only once (thereafter always query the server).
   * — So the first invokation happens synchronously, subsequent
   * invokations happens asynchronously.
   */
  function loadAndMarkMyPageInfo() {
    // Avoid a roundtrip by using any yaml data already inlined on the page.
    // Then delete it because it's only valid on page load.
    var hiddenYamlTag = $('.dw-data-yaml');
    if (hiddenYamlTag.length) {
      parseYamlMarkActions(hiddenYamlTag.text());
      hiddenYamlTag.hide().removeClass('dw-data-yaml');
    }
    else {
      // Query the server.
      // On failure, do what? Post error to non existing server error
      // reporting interface?
      $.get('?page-info&user=me', 'text')
          .fail(d.i.showServerResponseDialog)  // for now
          .done(function(yamlData) {
        parseYamlMarkActions(yamlData);
      });
    }

    function parseYamlMarkActions(yamlData) {
      var pageInfo = YAML.eval(yamlData);
      permsOnPage = pageInfo.permsOnPage;
      markMyActions(pageInfo);
    }

    function markMyActions(actions) {
      if (actions.ratings) $.each(actions.ratings, d.i.showMyRatings);
      if (actions.authorOf) $.each(actions.authorOf, function(ix, postId) {
        d.i.markMyPost(postId);
      });
    }
  }

  var api = {
    // Call whenever the SID changes: on page load, on login and logout.
    refreshProps: refreshProps,
    clearMyPageInfo: clearMyPageInfo,
    loadAndMarkMyPageInfo: loadAndMarkMyPageInfo,
    fireLogin: function() { fireLoginImpl(api); },
    fireLogout: function() { fireLogoutImpl(api); },
    // Call when a re-login might have happened, e.g. if focusing
    // another browser tab and then returning to this tab.
    fireLoginIfNewSession: fireLoginIfNewSession,

    // Warning: Never ever use this name as html, that'd open for
    // xss attacks. E.g. never do: $(...).html(Me.getName()), but the
    // following should be okay though: $(...).text(Me.getName()).
    getName: function() { return userProps.name; },
    isLoggedIn: function() { return userProps.loginId ? true : false; },
    getLoginId: function() { return userProps.loginId; },
    getUserId: function() { return userProps.userId; },
    mayEdit: function($post) {
      return userProps.userId === $post.dwAuthorId() ||
          permsOnPage.editPage ||
          (permsOnPage.editAnyReply && $post.dwIsReply()) ||
          (permsOnPage.editUnauReply && $post.dwIsUnauReply());
    },
    getEmailNotfPrefs: function() { return emailPrefs; },
    isEmailKnown: function() { return emailSpecified; }
  };

  return api;
};


function fireLoginImpl(Me) {
  Me.refreshProps();
  $('#dw-u-info').show()
      .find('.dw-u-name').text(Me.getName());
  $('#dw-a-logout').show();
  $('#dw-a-login').hide();

  // Update all xsrf tokens in any already open forms (perhaps with
  // draft texts, we shuldn't close them). Their xsrf prevention tokens
  // need to be updated to match the new session id cookie issued by
  // the server on login.
  var token = $.cookie('dwCoXsrf');
  //$.cookie('dwCoXsrf', null, { path: '/' }); // don't send back to server
  // ^ For now, don't clear the dwCoXsrf cookie, because then if the user
  // navigates back to the last page, after having logged out and in,
  // the xsrf-inputs would need to be refreshed from the cookie, because
  // any token sent from the server is now obsolete (after logout/in).
  $('input.dw-fi-xsrf').attr('value', token);

  // Let Post as ... and Save as ... buttons update themselves:
  // they'll replace '...' with the user name.
  $('.dw-loginsubmit-on-click')
      .trigger('dwEvLoggedInOut', [Me.getName()]);

  Me.clearMyPageInfo();
  Me.loadAndMarkMyPageInfo();
};


// Updates cookies and elements to show the user name, email etc.
// as appropriate. Unless !propsUnsafe, throws if name or email missing.
// Fires the dwEvLoggedInOut event on all .dw-loginsubmit-on-click elems.
// Parameters:
//  props: {name, email, website}, will be sanitized unless
//  sanitize: unless `false', {name, email, website} will be sanitized.
function fireLogoutImpl(Me) {
  Me.refreshProps();
  $('#dw-u-info').hide();
  $('#dw-a-logout').hide();
  $('#dw-a-login').show();

  // Clear all xsrf tokens. They are invalid now after logout, because
  // the server instructed the browser to delete the session id cookie.
  $('input.dw-fi-xsrf').attr('value', '');

  // Let `Post as <username>' etc buttons update themselves:
  // they'll replace <username> with `...'.
  $('.dw-loginsubmit-on-click').trigger('dwEvLoggedInOut', [undefined]);

  Me.clearMyPageInfo();
};


d.i.showMyRatings = function(postId, ratings) {
  var $header = d.i.findPostHeader$(postId);
  var $myRatings = $(  // i18n
    '<span>. <span class="dw-p-r-by-me">You rated it <em></em></span></span>');
  $myRatings.find('em').text(ratings.join(', '));
  $header.children('.dw-p-r-by-me').remove(); // remove any old
  // Insert after authorship, flags and ratings info.
  $header.children('.dw-p-r-top, .dw-p-flgs-top, .dw-p-at')
      .last().after($myRatings);
  // Remove outer <span>.
  $myRatings = $myRatings.children().unwrap();
  return $myRatings;
};


d.i.markMyPost = function(postId) {
  var $header = d.i.findPostHeader$(postId);
  $header.children('.dw-p-by').addClass('dw-p-by-me');
};


})();

// vim: fdm=marker et ts=2 sw=2 tw=80 fo=tcqwn list
