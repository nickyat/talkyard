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

/// <reference path="../../typedefs/angularjs/angular.d.ts" />
/// <reference path="../../typedefs/lodash/lodash.d.ts" />
/// <reference path="../plain-old-javascript.d.ts" />
/// <reference path="EditorModule.ts" />

var d = { i: debiki.internal, u: debiki.v0.util };
var d$: any = $;


class EditorController {

  public static $inject = ['$scope', 'EditorService'];
  constructor(private $scope: any, private editorService: EditorService) {
    this.closeEditor();
    $scope.vm = this;
  }


  public editNewForumTopic(parentPageId) {
    if (this.alertBadState())
      return;
    this.showEditor();
    this.$scope.newTopicParentPageId = parentPageId;
    this.$scope.text = 'New topic ....';
  }


  public toggleReplyToPost(postId) {
    if (this.alertBadState('WriteReply'))
      return;
    this.showEditor();
    var index = this.$scope.replyToPostIds.indexOf(postId);
    if (index === -1) {
      this.$scope.replyToPostIds.push(postId);
      return true;
    }
    else {
      this.$scope.replyToPostIds.splice(index, 1);
      if (this.$scope.replyToPostIds.length == 0) {
        this.closeEditor();
      }
      return false;
    }
  }


  public startEditing(postId) {
    if (this.alertBadState())
      return;
    this.$scope.editingPostId = postId;
    this.editorService.loadCurrentText(postId).then((currentText) => {
      this.$scope.text = currentText;
      this.showEditor();
    });
  }


  private alertBadState(wantsToDoWhat = null) {
    if (wantsToDoWhat !== 'WriteReply' && this.$scope.replyToPostIds.length > 0) {
      alert('Please first finish writing your post');
      return true;
    }
    if (this.$scope.editingPostId) {
      alert('Please first save your current edits');
      return true;
    }
    if (this.$scope.newTopicParentPageId) {
      alert('Please first either save or cancel your new forum topic');
      return true;
    }
    return false;
  }


  public cancel() {
    this.closeEditor();
  }


  public save() {
    if (this.$scope.newTopicParentPageId) {
      this.saveNewForumTopic();
    }
    else if (typeof this.$scope.editingPostId === 'number') {
      this.saveEdits();
    }
    else {
      this.saveNewPost();
    }
  }


  private saveNewForumTopic() {
    var data = {
      parentPageId: this.$scope.newTopicParentPageId,
      pageRole: 'ForumTopic',
      pageStatus: 'Published',
      pageTitle: 'New Forum Topic (click to edit)', // for now. TODO add title field
      pageBody: this.$scope.text
    };
    this.editorService.createNewPage(data).then((data: any) => {
      window.location.assign('/-' + data.newPageId);
    });
  }


  private saveEdits() {
    var data = {
      editPosts: [{
        pageId: d.i.pageId,
        postId: '' + this.$scope.editingPostId, // COULD stop requiring a number
        text: this.$scope.text
        // markup — skip, don't allow changing markup no more?
      }]
    };
    this.editorService.saveEdits(data).then(() => {
      this.closeEditor();
    });
  }


  private saveNewPost() {
    if (this.$scope.replyToPostIds.length > 1) {
      alert('Replying to more than one person not yet implemented – please ' +
        'de-select some comments, so only one reply button remains selected.');
      return;
    }
    var data = {
      pageId: d.i.pageId,
      pageUrl: d.i.iframeBaseUrl || undefined,
      postId: this.$scope.replyToPostIds[0],
      text: this.$scope.text
      // where: ...
    };
    this.editorService.saveReply(data).then(() => {
      this.closeEditor();
    });
  }


  public saveButtonTitle() {
    if (this.$scope.editingPostId)
      return 'Save edits';
    if (this.$scope.replyToPostIds.length)
      return 'Post reply';
    if (this.$scope.newTopicParentPageId)
      return 'Create new topic';
    return 'Save';
  }


  public showEditor() {
    this.$scope.visible = true;
    if (d.i.isInEmbeddedEditor) {
      window.parent.postMessage(
          JSON.stringify(['showEditor', {}]), '*');
    }
  }


  public closeEditor() {
    if (this.$scope.editingPostId) {
      this.$scope.text = '';
    }
    else {
      // The user was authoring a reply. Don't reset $scope.text in case
      // s/he clicked Cancel by mistake.
    }
    this.$scope.visible = false;
    this.$scope.newTopicParentPageId = null;
    this.$scope.replyToPostIds = [];
    this.$scope.editingPostId = null;

    // Not Angular style code to interact with the embedded comments iframe
    // and old plain Javascript code.
    if (d.i.isInEmbeddedEditor) {
      window.parent.postMessage(
          JSON.stringify(['hideEditor', {}]), '*');
    }
    else {
      $('.dw-replying').removeClass('dw-replying');
    }
  }

}


debiki2.editor.editorModule.controller("EditorController", EditorController);
