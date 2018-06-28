/// <reference path="../test-types.ts"/>

import * as _ from 'lodash';
import assert = require('assert');
import server = require('../utils/server');
import utils = require('../utils/utils');
import { buildSite } from '../utils/site-builder';
import pagesFor = require('../utils/pages-for');
import settings = require('../utils/settings');
import logAndDie = require('../utils/log-and-die');
import c = require('../test-constants');

declare var browser: any;
declare var browserA: any;
declare var browserB: any;

let forum: LargeTestForum;

let everyonesBrowsers;
let staffsBrowser;
let othersBrowser;
let owen: Member;
let owensBrowser;
let mons: Member;
let monsBrowser;
let modya: Member;
let modyasBrowser;
let corax: Member;
let coraxBrowser;
let regina: Member;
let reginasBrowser;
let maria: Member;
let mariasBrowser;
let michael: Member;
let michaelsBrowser;
let mallory: Member;
let mallorysBrowser;
let strangersBrowser;


let siteIdAddress: IdAddress;
let forumTitle = "Admin Review Invalidate Tasks about a reply";

let discussionPageUrl;

const angryReplyOne = 'angryReplyOne';
const angryReplyOneNr = c.FirstReplyNr;
const angryReplyTwo = 'angryReplyTwo';
const angryReplyTwoNr = c.FirstReplyNr + 1;
const angryReplyThree = 'angryReplyThree';
const angryReplyThreeNr = c.FirstReplyNr + 2;

describe("admin-review-invalidate-tasks-reply [TyT6KWB42A]", function() {

  it("import a site", () => {
    browser.perhapsDebugBefore();
    forum = buildSite().addLargeForum({ title: forumTitle, members: null /* default = everyone */ });
    siteIdAddress = server.importSiteData(forum.siteData);
    discussionPageUrl = siteIdAddress.origin + '/' + forum.topics.byMichaelCategoryA.slug;
  });

  it("initialize people", () => {
    everyonesBrowsers = _.assign(browser, pagesFor(browser));
    staffsBrowser = _.assign(browserA, pagesFor(browserA));
    othersBrowser = _.assign(browserB, pagesFor(browserB));

    owen = forum.members.owen;
    owensBrowser = staffsBrowser;
    mons = forum.members.mons;
    monsBrowser = staffsBrowser;
    modya = forum.members.modya;
    modyasBrowser = staffsBrowser;
    corax = forum.members.corax;
    coraxBrowser = staffsBrowser;

    regina = forum.members.regina;
    reginasBrowser = othersBrowser;
    maria = forum.members.maria;
    mariasBrowser = othersBrowser;
    michael = forum.members.michael;
    michaelsBrowser = othersBrowser;
    mallory = forum.members.mallory;
    mallorysBrowser = othersBrowser;
    strangersBrowser = othersBrowser;
  });

  it("Mallory posts three very angry replies", function() {
    mallorysBrowser.go(discussionPageUrl);
    mallorysBrowser.complex.loginWithPasswordViaTopbar(mallory);
    mallorysBrowser.complex.replyToOrigPost(angryReplyOne);
    mallorysBrowser.complex.replyToOrigPost(angryReplyTwo);
    mallorysBrowser.complex.replyToOrigPost(angryReplyThree);
  });

  it("Maria flags all of them", function() {
    mallorysBrowser.topbar.clickLogout();
    mariasBrowser.complex.loginWithPasswordViaTopbar(maria);
    mariasBrowser.complex.flagPost(angryReplyOneNr, 'Inapt');
    mariasBrowser.complex.flagPost(angryReplyTwoNr, 'Inapt');
    mariasBrowser.complex.flagPost(angryReplyThreeNr, 'Inapt')
  });

  it("Michael flags the two first too", function() {
    mariasBrowser.topbar.clickLogout();
    michaelsBrowser.complex.loginWithPasswordViaTopbar(michael);
    michaelsBrowser.complex.flagPost(angryReplyOneNr, 'Inapt');
    michaelsBrowser.complex.flagPost(angryReplyTwoNr, 'Inapt');
  });

  it("Owen arrives, sees there're 5 high priority things to review", function() {
    owensBrowser.go(siteIdAddress.origin);
    owensBrowser.complex.loginWithPasswordViaTopbar(owen);
    owensBrowser.topbar.waitForNumPendingUrgentReviews(5); // 3 + 2 = maria's + michael's
    owensBrowser.topbar.waitForNumPendingOtherReviews(1);  // because reply posted by new user = Mallory
  });

  it("The number of tasks per post are correct", function() {
    owensBrowser.adminArea.goToReview();
    const count = owensBrowser.adminArea.review.countReviewTasksFor;
    // 3 tasks for reply one (2 flags + 1, new users' first post)
    assert(count(forum.topics.byMichaelCategoryA.id, angryReplyOneNr, { waiting: true }) === 3);
    // 2 tasks for reply two (2 flags)
    assert(count(forum.topics.byMichaelCategoryA.id, angryReplyTwoNr, { waiting: true }) === 2);
    // 1 task for reply three (3 flag by Maria only)
    assert(count(forum.topics.byMichaelCategoryA.id, angryReplyThreeNr, { waiting: true }) === 1);
  });

  it("Owen reject-delete's Mallory's reply nr 2", function() {
    // Post 2 flagged last, so is at the top.
    owensBrowser.adminArea.review.rejectDeleteTaskIndex(1);
  });

  it("... the server carries out this decision", function() {
    owensBrowser.adminArea.review.waitForServerToCarryOutDecisions(
        forum.topics.byMichaelCategoryA.id, angryReplyTwoNr);
  });

  it("... then all review tasks for post 2 disappear", function() {
    const count = owensBrowser.adminArea.review.countReviewTasksFor;
    assert(count(forum.topics.byMichaelCategoryA.id, angryReplyOneNr, { waiting: true }) === 3);
    assert(count(forum.topics.byMichaelCategoryA.id, angryReplyTwoNr, { waiting: false }) === 2);
    assert(count(forum.topics.byMichaelCategoryA.id, angryReplyThreeNr, { waiting: true }) === 1);
  });

  it("... the others tasks aren't affected", function() {
    const count = owensBrowser.adminArea.review.countReviewTasksFor;
    assert(count(forum.topics.byMichaelCategoryA.id, angryReplyOneNr, { waiting: true }) === 3);
    assert(count(forum.topics.byMichaelCategoryA.id, angryReplyThreeNr, { waiting: true }) === 1);
  });

  it("Topbar review counts are correct", function() {
    owensBrowser.refresh();
    owensBrowser.topbar.waitForNumPendingUrgentReviews(3); // 2 + 1 = maria's + michael's remaining flags
    owensBrowser.topbar.waitForNumPendingOtherReviews(1);  // because reply posted by new user = Mallory
  });

  it("Owen reject-deletes 2 tasks (out of 3) for post 1", function() {
    // task 1 = for post 2, its last flag          <— rejected already
    // task 2 = for post 1, its last flag          <— **click Delete**
    // task 3 = for post 3, its first flag
    // task 4 = for post 2, its first flag         <— rejected already
    // task 5 = for post 1, new user's first post  <— will get invalidated, since post deleted
    // task 6 = for post 1, new user's first post  <— **click Delete**
    owensBrowser.adminArea.review.rejectDeleteTaskIndex(2);
    owensBrowser.adminArea.review.rejectDeleteTaskIndex(6);
  });

  it("... the server carries out the decisions", function() {
    owensBrowser.adminArea.review.waitForServerToCarryOutDecisions(
        forum.topics.byMichaelCategoryA.id, angryReplyOneNr);
  });

  it("... then all review tasks for post 1 disappear", function() {
    const count = owensBrowser.adminArea.review.countReviewTasksFor;
    assert(count(forum.topics.byMichaelCategoryA.id, angryReplyOneNr, { waiting: true }) === 0);
    assert(count(forum.topics.byMichaelCategoryA.id, angryReplyOneNr, { waiting: false }) === 3);
  });

  it("So now only a task for angry-reply-three remains", function() {
    const count = owensBrowser.adminArea.review.countReviewTasksFor;
    assert(count(forum.topics.byMichaelCategoryA.id, angryReplyOneNr, { waiting: true }) === 0);
    assert(count(forum.topics.byMichaelCategoryA.id, angryReplyTwoNr, { waiting: true }) === 0);
    assert(count(forum.topics.byMichaelCategoryA.id, angryReplyThreeNr, { waiting: true }) === 1);
    assert(count(forum.topics.byMichaelCategoryA.id, angryReplyOneNr, { waiting: false }) === 3);
    assert(count(forum.topics.byMichaelCategoryA.id, angryReplyTwoNr, { waiting: false }) === 2);
    assert(count(forum.topics.byMichaelCategoryA.id, angryReplyThreeNr, { waiting: false }) === 0);
  });

  it("Needs-to-review counts are correct", function() {
    owensBrowser.refresh();
    owensBrowser.topbar.waitForNumPendingUrgentReviews(1); // Maria flagged post nr 3
    assert(!owensBrowser.topbar.isNeedsReviewOtherVisible());
  });

  it("Owen deletes Mallory's post nr 3 by visiting it directly", function() {
    owensBrowser.go(discussionPageUrl);
    owensBrowser.topic.deletePost(angryReplyThreeNr);
  });

  it("Now there're no need-to-review notfs in his my-menu in the topbar", function() {
    owensBrowser.refresh();
    owensBrowser.topbar.waitForVisible();
    assert(!owensBrowser.topbar.isNeedsReviewUrgetnVisible());
    assert(!owensBrowser.topbar.isNeedsReviewOtherVisible());
  });

  it("... and no waiting review tasks on the Reviews page", function() {
    owensBrowser.adminArea.goToReview();
    assert(!owensBrowser.adminArea.review.isMoreStuffToReview());
  });

  /* TESTS_MISSING   [UNDELPOST]
  it("Owen undeletes Mallory's post nr 3", function() {
    owensBrowser.go(discussionPageUrl);
    owensBrowser.topic.undeletePost(angryReplyThreeNr);
  });

  it("... its review task then reappears", function() {
  });

  it("... he deletes it by rejecting the review task instead", function() {
  });  */

});

