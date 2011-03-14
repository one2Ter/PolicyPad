/**
* Copyright 2010 PolicyPad 
* 
* Licensed under the Apache License, Version 2.0 (the "License"); 
* you may not use this file except in compliance with the License. 
* You may obtain a copy of the License at 
*
*     http://www.apache.org/licenses/LICENSE-2.0
*
* Unless required by applicable law or agreed to in writing, software 
* distributed under the License is distributed on an "AS IS" BASIS, 
* WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied. 
* See the License for the specific language governing permissions and 
* limitations under the License.
*/

/**
 * EtherpadDocument tracks a previous document version and the current version.
 * When a changeset is requested, the revisions are set equal to eachother.
 * This class also wraps up the functionality of applying changesets to an
 * existing document because that operation requires knowledge of our own
 * changes.
 * @param func A function that takes a single optional parameter.  When
 * called with a parameter, the html value should be set, and when the 
 * parameter is omitted, the current html value is returned
 */
function EtherpadDocument(func, initialText) {
  this._func = func;
  //TODO: This class needs to track more than just HTML. In Etherpad, the text
  //consists of both the text and the mapping of text to attributes.  Etherpad
  //also tracks an attribute pool (apool) which provides formatting information,
  //but more importantly, authorship information.  Changeset manipulation needs
  //to manipulate both the text and the text/apool mappings.
  this._prevHtml = initialText.text;
  this._pendingChangeset = null;
}

EtherpadDocument.prototype.generateChangeset = function() {
  if (this._pendingChangeset || this._prevHtml == this._func())
    return null;
  this._pendingChangeset = generateChangeset(this._prevHtml, this._func());
  return this._pendingChangeset;
}

EtherpadDocument.prototype.applyChangeset = function(changeset, apool) {
  if (this._prevHtml == this._func()) {
    //no need to merge changes, just apply the changeset to our base
    var newhtml = applyChangeset(this._prevHtml, changeset);
    this._func(newhtml);
    this._prevHtml = newhtml;
  }
  else {
    //We have local uncommitted changes, this merge is a bit more complicated

    //1. Generate changeset between html and prevHtml
    var baseDiff = generateChangeset(this._prevHtml, this._func());

    //2. Merge the two changesets
    var merged = mergeChangeset(this._prevHtml, baseDiff, changeset);

    //3. Apply merged to func()
    var newHtml = applyChangeset(this._func(), merged);
    this._func(newHtml);
    
    //4. Apply changeset to prevHtml
    this._prevHtml = applyChangeset(this._prevHtml, changeset);
  }

  return;
}

EtherpadDocument.prototype.hasPendingChangeset = function() {
  return this._pendingChangeset != null;
}

EtherpadDocument.prototype.changesetAccepted = function() {
  this._prevHtml = applyChangeset(this._prevHtml, this._pendingChangeset);
  this._pendingChangeset = null;
}

EtherpadDocument.prototype.isModified = function() {
  return this._prevHtml != this._func();
}

