/*
 * Copyright (C) 2014 Kaj Magnus Lindberg (born 1979)
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU Affero General Public License as
 * published by the Free Software Foundation, either version 3 of the
 * License, or (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU Affero General Public License for more details.
 *
 * You should have received a copy of the GNU Affero General Public License
 * along with this program.  If not, see <http://www.gnu.org/licenses/>.
 */

/// <reference path="../../typedefs/react/react.d.ts" />
/// <reference path="../ReactStore.ts" />
/// <reference path="../links.ts" />
/// <reference path="../login/login-dialog.ts" />
/// <reference path="../page-tools/page-tools.ts" />
/// <reference path="../utils/page-scroll-mixin.ts" />
/// <reference path="../utils/scroll-into-view.ts" />
/// <reference path="../utils/MenuItemLink.ts" />
/// <reference path="../utils/utils.ts" />
/// <reference path="../post-navigation/posts-trail.ts" />
/// <reference path="../avatar/avatar.ts" />
/// <reference path="../notification/Notification.ts" />
/// <reference path="../../typedefs/keymaster/keymaster.d.ts" />

//------------------------------------------------------------------------------
   module debiki2.reactelements {
//------------------------------------------------------------------------------

var keymaster: Keymaster = window['keymaster'];
var d = { i: debiki.internal, u: debiki.v0.util };
var r = React.DOM;
var reactCreateFactory = React['createFactory'];
var ReactBootstrap: any = window['ReactBootstrap'];
var Button = reactCreateFactory(ReactBootstrap.Button);
var DropdownButton = reactCreateFactory(ReactBootstrap.DropdownButton);
var MenuItem = reactCreateFactory(ReactBootstrap.MenuItem);
var MenuItemLink = utils.MenuItemLink;

var FixedTopDist = 8;

export var TopBar = createComponent({
  mixins: [debiki2.StoreListenerMixin, debiki2.utils.PageScrollMixin],

  getInitialState: function() {
    return {
      store: debiki2.ReactStore.allData(),
      showSearchForm: false,
      fixed: false,
      initialOffsetTop: -1,
    };
  },

  componentWillMount: function() {
    // We call it from render(). (Is that ok?)
    pagetools.getPageToolsDialog();
  },

  componentDidMount: function() {
    keymaster('1', this.goToTop);
    keymaster('2', this.goToReplies);
    keymaster('3', this.goToChat);
    keymaster('4', this.goToEnd);
    var rect = this.getThisRect();
    var pageTop = getPageScrollableRect().top;
    this.setState({
      initialOffsetTop: rect.top - pageTop,
      fixed: rect.top < -FixedTopDist,
    });
  },

  componentWillUnmount: function() {
    keymaster.unbind('1', 'all');
    keymaster.unbind('2', 'all');
    keymaster.unbind('3', 'all');
    keymaster.unbind('4', 'all');
  },

  getThisRect: function() {
    return this.getDOMNode().getBoundingClientRect();
  },

  onChange: function() {
    this.setState({
      store: debiki2.ReactStore.allData()
    });
    // If the watchbar was opened or closed, we need to rerender with new left: offset.
    this.onScroll();
  },

  onScroll: function() {
    var pageRect = getPageScrollableRect();
    var pageLeft = pageRect.left;
    if (this.state.store.isWatchbarOpen) {
      pageLeft -= 230; // dupl value, in css too [7GYK42]
    }
    var pageTop = pageRect.top;
    var newTop = -pageTop - this.state.initialOffsetTop;
    this.setState({ top: newTop, left: -pageLeft });
    if (!this.state.fixed) {
      if (-pageTop > this.state.initialOffsetTop + FixedTopDist || pageLeft < -40) {
        this.setState({ fixed: true });
      }
    }
    else if (pageLeft < -20) {
      // We've scrolled fairly much to the right, so stay fixed.
    }
    else {
      // Add +X otherwise sometimes the fixed state won't vanish although back at top of page.
      if (-pageTop < this.state.initialOffsetTop + 5) {
        this.setState({ fixed: false, top: 0, left: 0 });
      }
    }
  },

  onLoginClick: function() {
    // COULD call new fn ReactActions.login() instead?
    login.getLoginDialog().open(this.props.purpose || 'LoginToLogin');
  },

  onLogoutClick: function() {
    debiki2.ReactActions.logout();
  },

  showTools: function() {
    pagetools.getPageToolsDialog().open();
  },

  closeSearchForm: function() {
    this.setState({
      showSearchForm: false
    });
  },

  onSearchClick: function() {
    this.setState({
      showSearchForm: !this.state.showSearchForm
    });
  },

  goToTop: function() {
    debiki2.postnavigation.addVisitedPosition();
    utils.scrollIntoViewInPageColumn($('.dw-page'), { marginTop: 30, marginBottom: 9999 });
  },

  goToReplies: function() {
    debiki2.postnavigation.addVisitedPosition();
    utils.scrollIntoViewInPageColumn(
        $('.dw-depth-0 > .dw-p-as'), { marginTop: 60, marginBottom: 9999 });
  },

  goToChat: function() {
    debiki2.postnavigation.addVisitedPosition();
    utils.scrollIntoViewInPageColumn($('#dw-chat'), { marginTop: 60, marginBottom: 9999 });
  },

  goToEnd: function() {
    debiki2.postnavigation.addVisitedPosition();
    utils.scrollIntoViewInPageColumn($('#dw-the-end'), { marginTop: 60, marginBottom: 30 });
  },

  viewOlderNotfs: function() {
    ReactActions.goToUsersNotifications(this.state.store.user.userId);
  },

  render: function() {
    var store: Store = this.state.store;
    var me: Myself = store.me;
    var pageRole = store.pageRole;

    // Don't show all these buttons on a homepage / landing page, until after has scrolled down.
    // If not logged in, never show it — there's no reason for new users to login on the homepage.
    if (pageRole === PageRole.HomePage && (!this.state.fixed || !me || !me.isLoggedIn))
      return r.div();

    // ------- Top, Replies, Bottom, Back buttons

    var goToButtons;
    if (this.state.fixed && pageRole && pageRole !== PageRole.HomePage &&
        pageRole !== PageRole.Forum) {
      var topHelp = "Go to the top of the page. Shortcut: 1 (on the keyboard)";
      var repliesHelp = "Go to the replies section. There are " + store.numPostsRepliesSection +
        " replies. Shortcut: 2";
      var chatHelp = "Go to the chat section. There are " + store.numPostsChatSection +
        " comments. Shortcut: 3";
      var endHelp = "Go to the bottom of the page. Shortcut: 4";

      var goToTop = Button({ className: 'dw-goto', onClick: this.goToTop, title: topHelp }, "Top");
      var goToReplies = page_isChatChannel(store.pageRole) ? null :
          Button({ className: 'dw-goto', onClick: this.goToReplies,
            title: repliesHelp }, "Replies (" + store.numPostsRepliesSection + ")");
      var goToChat = !hasChatSection(store.pageRole) ? null :
          Button({ className: 'dw-goto', onClick: this.goToChat,
            title: chatHelp }, "Chat (" + store.numPostsChatSection + ")");
      var goToEnd = Button({ className: 'dw-goto', onClick: this.goToEnd, title: endHelp }, "End");

      goToButtons = r.span({ className: 'dw-goto-btns' },
          goToTop, goToReplies, goToChat, goToEnd, debiki2.postnavigation.PostNavigation());
    }

    // ------- Avatar & username dropdown, + notf icons

    var talkToMeNotfs = makeNotfIcon('toMe', me.numTalkToMeNotfs);
    var talkToOthersNotfs = makeNotfIcon('toOthers', me.numTalkToOthersNotfs);
    var otherNotfs = makeNotfIcon('other', me.numOtherNotfs);
    var anyDivider = me.notifications.length ? MenuItem({ divider: true }) : null;
    var notfsElems = me.notifications.map((notf: Notification) =>
        MenuItemLink({ key: notf.id, href: linkToNotificationSource(notf),
            className: notf.seen ? '' : 'esNotf-unseen' },
          notification.Notification({ notification: notf })));
    if (me.thereAreMoreUnseenNotfs) {
      notfsElems.push(
          MenuItem({ key: 'More', onSelect: this.viewOlderNotfs }, "View more notifications..."));
    }
    var avatarNameAndNotfs =
        r.span({},
          avatar.Avatar({ user: me, tiny: true, ignoreClicks: true }),
          r.span({ className: 'esAvtrName_name' }, me.username || me.fullName),
          r.span({ className: 'esAvtrName_you' }, "You"), // if screen too narrow
          talkToMeNotfs,
          talkToOthersNotfs,
          otherNotfs);
    var avatarNameDropdown = !me.isLoggedIn ? null :
        DropdownButton({ title: avatarNameAndNotfs, className: 'esAvtrName', pullRight: true,
            noCaret: true },
          MenuItemLink({ href: linkToMyProfilePage(store) }, "View your profile"),
          MenuItem({ onSelect: this.onLogoutClick }, "Log out"),
          anyDivider,
          notfsElems);

    // ------- Login button

    var loginButton = me.isLoggedIn ? null :
        Button({ className: 'dw-login btn-primary', onClick: this.onLoginClick },
            r.span({ className: 'icon-user' }, 'Log In'));

    // ------- Tools button

    // (Is it ok to call another React component from here? I.e. the page tools dialog.)
    var toolsButton = !isStaff(me) || pagetools.getPageToolsDialog().isEmpty() ? null :
        Button({ className: 'dw-a-tools', onClick: this.showTools },
          r.a({ className: 'icon-wrench' }, 'Tools'));

    // ------- Hamburger dropdown, + review task icons

    var urgentReviewTasks = makeNotfIcon('reviewUrgent', me.numUrgentReviewTasks);
    var otherReviewTasks = makeNotfIcon('reviewOther', me.numOtherReviewTasks);
    var menuTitle = r.span({ className: 'icon-menu' }, urgentReviewTasks, otherReviewTasks);
    var adminMenuItem = !isStaff(me) ? null :
        MenuItemLink({ href: linkToAdminPage() },
          r.span({ className: 'icon-settings' }, "Admin"));
    var reviewMenuItem = !urgentReviewTasks && !otherReviewTasks ? null :
        MenuItemLink({ href: linkToReviewPage() },
          "Needs review ", urgentReviewTasks, otherReviewTasks);

    var quickLinks = [];
    _.each(store.siteSections, (section: SiteSection) => {
      dieIf(section.pageRole !== PageRole.Forum, 'EsE5JTK20');
      // COULD if > 1 section, then add tabs, one for each section.
      var url;
      url = section.path + '#/latest/';
      quickLinks.push(MenuItemLink({ key: url, href: url }, "Latest"));
      url = section.path + '#/top/';
      quickLinks.push(MenuItemLink({ key: url, href: url }, "Top"));
      url = section.path + '#/categories/';
      quickLinks.push(MenuItemLink({ key: url, href: url }, "Categories"));
      quickLinks.push(MenuItem({ key: section.pageId, divider: true }));
    });

    var menuDropdown =
        DropdownButton({ title: menuTitle, className: 'dw-menu esMenu', pullRight: true,
            noCaret: true },
          adminMenuItem,
          reviewMenuItem,
          (adminMenuItem || reviewMenuItem) && quickLinks.length ?
              MenuItem({ divider: true }) : null,
          quickLinks,
          MenuItem({ onSelect: ReactActions.showHelpMessagesAgain },
              r.span({ className: 'icon-help' }, "Unhide help messages")),
          MenuItemLink({ href: '/about' }, "About this site"),
          MenuItemLink({ href: '/-/terms-of-use' }, "Terms and Privacy"));

    // ------- Search button

    var searchButton =
        null;
    /* Hide for now, search broken, after I rewrote from dw1_posts to dw2_posts.
     Button({ className: 'dw-search', onClick: this.onSearchClick },
     r.span({ className: 'icon-search' }));
     */

    var searchForm = !this.state.showSearchForm ? null :
        SearchForm({ onClose: this.closeSearchForm });

    // ------- Title

    var pageTitle;
    if (pageRole === PageRole.Forum) {
      var titleProps: any = _.clone(store);
      titleProps.hideButtons = this.state.fixed;
      pageTitle =
          r.div({ className: 'dw-topbar-title' }, page.Title(titleProps));
    }

    // ------- Watchbar and Pagebar buttons

    var openContextbarButton =
        Button({ className: 'esOpenPagebarBtn', onClick: ReactActions.openPagebar },
            r.span({ className: 'icon-left-open' }));

    var openWatchbarButton =
        Button({ className: 'esOpenWatchbarBtn', onClick: ReactActions.openWatchbar },
            r.span({ className: 'icon-right-open' }));


    // ------- The result

    var topbar =
      r.div({ className: 'esTopBar' },
        r.div({ className: 'dw-topbar-btns' },
          loginButton,
          toolsButton,
          searchButton,
          menuDropdown,
          avatarNameDropdown),
        searchForm,
        pageTitle,
        goToButtons);

    var fixItClass = '';
    var styles = {};
    if (this.state.fixed) {
      fixItClass = ' dw-fixed-topbar-wrap';
      styles = { top: this.state.top, left: this.state.left }
    }
    return (
        r.div({ className: 'esTopbarWrap' + fixItClass, style: styles },
          openWatchbarButton,
          openContextbarButton,
          r.div({ className: 'container' },
            topbar)));
  }
});


function makeNotfIcon(type: string, number: number) {
  if (!number) return null;
  var numMax99 = Math.min(99, number);
  var wideClass = number >= 10 ? ' esNotfIcon-wide' : '';
  return r.div({ className: 'esNotfIcon esNotfIcon-' + type + wideClass}, numMax99);
}


var SearchForm = createComponent({
  componentDidMount: function() {
    keymaster('escape', this.props.onClose);
    $(this.refs.input.getDOMNode()).focus();
  },

  componentWillUnmount: function() {
    keymaster.unbind('escape', 'all');
  },

  search: function() {
    $(this.refs.xsrfToken.getDOMNode()).val($['cookie']('XSRF-TOKEN'));
    $(this.refs.form.getDOMNode()).submit();
  },

  render: function() {
    return (
        r.div({ className: 'dw-lower-right-corner' },
          r.form({ id: 'dw-search-form', ref: 'form', className: 'debiki-search-form form-search',
              method: 'post', acceptCharset: 'UTF-8', action: '/-/search/site',
              onSubmit: this.search },
            r.input({ type: 'hidden', ref: 'xsrfToken', name: 'dw-fi-xsrf' }),
            r.input({ type: 'text', tabIndex: '1', placeholder: 'Text to search for',
                ref: 'input', className: 'input-medium search-query', name: 'searchPhrase' }))));
  }
});

//------------------------------------------------------------------------------
   }
//------------------------------------------------------------------------------
// vim: fdm=marker et ts=2 sw=2 tw=0 fo=tcqwn list
