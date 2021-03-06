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

function parseChangeset(changeset) {
  var parts = changeset.split('$');
  
  if (changeset.substring(0,2) != "Z:")  {
      return null;
  }
  if (parts.length != 2) {
      return null;
  }
  
  var bank = parts[1];
  changeset = parts[0].substring(2);

  convBase36 = function(str) { return parseInt(str, 36); }

  parts = changeset.match(/^(\w+)([><])(\w+)/);
  if (!parts) {
    return null;
  }
  oldlen = convBase36(parts[1]);
  newlen = convBase36(parts[3]);
  switch (parts[2])
  {
    case '<':
      newlen = oldlen - newlen;
      break;
    case '>':
      newlen += oldlen;
      break;
    default:
      return null;
  }

  changeset = changeset.substring(parts[0].length);

  function OpIterator(changeset) {
    this._lens = changeset.split(/[|=+*-]/);
    this._ops = changeset.split(/\w+/);
    //conditionals added because IE doesn't know how to regex split strings
    if (this._lens != null && this._lens.length > 0 && this._lens[0] == "")
      this._lens.shift();
      if (this._ops != null && this._ops.length > 0 && this._ops[this._ops.length-1] == "")
    this._ops.pop();
  }
  OpIterator.prototype.next = function() {
    var iterator = this;

    if (!this.hasNext())
      return null;

    var nextPart = function() {
      return {op: iterator._ops.shift(), len: convBase36(iterator._lens.shift())};
    }

    var newlines = 0;
    var attribs = [];
    var part = nextPart();
    while (part.op == '|' || part.op == '*') {
      if (part.op == '|') {
        newlines = part.len;
      } else {
        attribs.push(part.len);
      }
      part = nextPart();
    }

    part.newlines = newlines;
    part.attribs = attribs;

    return part;
  }
  OpIterator.prototype.hasNext = function() {
    return this._lens.length > 0;
  }
  OpIterator.prototype.__iterator__ = function() { return this; }

  var ops = new OpIterator(changeset);

  return {
    prefix: "Z:" + parts[0],
    ops: ops,
    oldlen: oldlen,
    newlen: newlen,
    bank: bank
  };
}

/**
 * Takes oldText and applies the given changeset to it.
 * @param {String} oldText The original text to modify.
 * @param {String} changeset The changeset to apply the document
 * @return A new document, transformed by the changeset
 */
function applyChangeset(oldText, changeset) {
  var res = ''; 
  
  var fail = function(msg) {
    alert("applyChangeset failed: " + msg);
    return null;
  }

  parsed = parseChangeset(changeset);
  if (!parsed)
    return fail("!parsed");
  if (oldText.length != parsed.oldlen) {
    return fail("oldText.length(" + oldText.length + ") != parsed.oldlen(" + parsed.oldlen + ")");
  }

  //TODO: update attribs
  var i = 0;
  for (var part = parsed.ops.next(); part != null; part = parsed.ops.next()) {
    switch (part.op) {
      case '=':
        change = oldText.substring(i, i + part.len);
        if (change.split('\n').length-1 != part.newlines) {
          return fail("change.split('\n').length-1 != part.newlines");
        }
        res += change;
        i += part.len;
        break;
      case '+':
        res += parsed.bank.substring(0, part.len);
        parsed.bank = parsed.bank.substring(part.len);
        break;
      case '-':
        if (oldText.substring(i, i + part.len).split('\n').length-1 != part.newlines) {
          return fail("oldText.substring(i, i + part.len");
        }
        i += part.len;
        break;
    }
  }
 
  //The rest of the document is unchanged
  res += oldText.substring(i);

  if (res.length != newlen) {
    return fail("res.length != newlen");
  }

  return res;
}

function optimizeChangeset(oldText, changeset) {

  var append_part = function(changeset, part) {
    var packNum = function(num) { return num.toString(36).toLowerCase(); };
    for (var i = 0; i < part.attribs.length; i++) {
      changeset += "*" + part.attribs[i];
    }
    if (part.newlines > 0)
      changeset += "|" + packNum(part.newlines);
    changeset += part.op + packNum(part.len);
    return changeset
  };

  var compareAttribs = function(attribs1, attribs2) {
    attribs1 = attribs1.slice(0);
    attribs2 = attribs2.slice(0);
    if (attribs1.length != attribs2.length)
      return false;
    for (var i = 0; i < attribs1.length; i++)
      if (attribs1[i] != attribs2[i])
        return false;
    return true;
  };

  var collapse = function(changeset) {
    parsed = parseChangeset(changeset);
    collapsed = parsed.prefix;
    var prevPart = null;
    for (var part = parsed.ops.next(); part != null; part = parsed.ops.next()) {
      if (prevPart && prevPart.op == part.op && compareAttribs(prevPart.attribs, part.attribs)) {
        prevPart.len += part.len;
        prevPart.newlines += part.newlines;
      } else {
        if (prevPart) {
          collapsed = append_part(collapsed, prevPart);
          prevPart = null;
        }
        prevPart = part;
      }
    }
    if (prevPart && prevPart.op != "=")
      collapsed = append_part(collapsed, prevPart);
    collapsed += "$" + parsed.bank;

    return collapsed;
  };

  var optimize = function(changeset) {
    //console.log("--Begin Optimize--");
    parsed = parseChangeset(changeset);
    optimized = parsed.prefix;
    var pot = "";
    var prevPart = null;
    var text = oldText;
    
    for (var part = parsed.ops.next(); part != null; part = parsed.ops.next()) {
      if (prevPart != null && part.op == '+') {
        textPart = text.substring(0, prevPart.len);
        potPart = parsed.bank.substring(0, part.len);
        //console.log("Bank: " + parsed.bank);
        var i = textPart.length-1;
        var j = potPart.length-1;
        var newlines = 0;
        //console.log(JSON.stringify({i: i, j: j}));
        //console.log(JSON.stringify({textPart: textPart, potPart: potPart}));
        while ((textPart.charAt(i) == potPart.charAt(j)) && (i >= 0) && (j > 0)) {
          if (textPart.charAt(i) == '\n') {
            newlines++;
          }
          i--;
          j--;
        }
        len = textPart.length - 1 - i;
        //console.log(JSON.stringify({i: i, j: j, len: len}));
        prevPart.len -= len;
        prevPart.newlines -= newlines;
        part.len -= len;
        part.newlines -= newlines;
        newPartPost = {op: '=', len: len, newlines: newlines, attribs: []};
        textPart = textPart.substring(0, i+1);
        potPart = potPart.substring(0, j+1);

        i = 0;
        newlines = 0;
        for (i = 0; textPart.charAt(i) == potPart.charAt(i) && (i < textPart.length) && (i < potPart.length); i++) {
          if (textPart.charAt(i) == '\n')
            newlines++;
        }
        if (i > 0) {
          //console.log("big i");
          prevPart.len -= i;
          prevPart.newlines -= newlines;
          part.len -= i;
          part.newlines -= newlines;
          newPart = {op: '=', len: i, newlines: newlines, attribs: []};
          optimized = append_part(optimized, newPart);
          text = text.substring(newPart.len);
        }

        if (prevPart.len > 0) {
          optimized = append_part(optimized, prevPart);
          text = text.substring(prevPart.len);
        }
	if (part.len > 0)
	  optimized = append_part(optimized, part);
        if (newPartPost.len > 0)
          optimized = append_part(optimized, newPartPost);

        pot += parsed.bank.substring(i, i + part.len);
        //console.log(JSON.stringify({i: i, partlen: part.len}));
        //console.log(pot);
        parsed.bank = parsed.bank.substring(i + part.len + len);
        prevPart = null;
      } else {
        if (prevPart) {
          //unoptimized '-' op
          text = text.substring(prevPart.len);
          optimized = append_part(optimized, prevPart);
          prevPart = null;
        }
        switch (part.op) {
          case '=':
            text = text.substring(part.len);
            optimized = append_part(optimized, part);
            break;
          case '+':
            pot += parsed.bank.substring(0, part.len);
            parsed.bank = parsed.bank.substring(part.len);
            optimized = append_part(optimized, part);
            break;
          case '-':
            prevPart = part;
            break;
        }
      }
    }
    if (prevPart)
      optimized = append_part(optimized, prevPart);
    optimized += "$" + pot;

    //console.log("--End Optimize--");

    return optimized;
  }

  var optimizers = [
                    collapse, 
                    optimize,
                    collapse];
  var origChangeset;
  var newChangeset = changeset;

  do {
    origChangeset = newChangeset;
    jQuery.each(optimizers, function(i, optimizer) {
      newChangeset = optimizer(newChangeset);
    });
  } while (newChangeset != origChangeset);
  //console.log(" ");

  return newChangeset;
}

/**
 * Generates a changeset that conveys the changes from the old text (o)
 * to the new text (n)
 *
 * Based on John Resig's JavaScript diff algorithm
 */
function generateChangeset(oldText, newText){

  if (newText == null || oldText == null)
    alert("Null text: ");

    function _newlines(t) {
        var newlines = t.match(/\n/g);
        if (newlines == null) {
            return '';
        }
        return '|' + packNum(newlines.length);
    }

    function _diff(o, n){
        var ns = {}; 
        var os = {};
        var i;
        var x = null;
        for (i=0; i<n.length; i++) {
            if (ns[n[i]] == x) {
                ns[n[i]] = {rows:[], o:x};
            }
            ns[n[i]].rows.push(i)
        }
        for (i=0; i<o.length; i++) {
            if(os[o[i]] == x) {
                os[o[i]] = {rows:[], n:x};
            }
            os[o[i]].rows.push(i);
        }
        for (i in ns){
            if (ns[i].rows.length == 1 && typeof(os[i]) != 'undefined' && os[i].rows.length == 1){
                n[ns[i].rows[0]] = {text:n[ns[i].rows[0]], row:os[i].rows[0]};
                o[os[i].rows[0]] = {text:o[os[i].rows[0]], row:ns[i].rows[0]};
            }
        }
        for (i=0; i<n.length-1; i++){
            if (n[i].text != x && n[i+1].text == x && n[i].row + 1 < o.length 
                && o[n[i].row+1].text == x && n[i+1]==o[n[i].row+1]) {
                n[i+1] = {text:n[i+1], row:n[i].row+1};
                o[n[i].row+1] = {text:o[n[i].row+1], row:i+1};
            }
        }
        for(i=n.length-1; i>0; i--){
            if(n[i].text!=x && n[i-1].text==x && n[i].row>0 && o[n[i].row-1].text==x &&
            n[i-1] == o[n[i].row-1]) {
                n[i-1] = {text:n[i-1], row:n[i].row - 1};
                o[n[i].row-1] = {text:o[n[i].row-1], row:i - 1};
            }
        }
        return {o:o, n:n}
    }

    var packNum = function(num) { return num.toString(36).toLowerCase(); };
    var str = 'Z:' + packNum(oldText.length);
    str += newText.length >= oldText.length 
        ? '>' + packNum(newText.length - oldText.length) 
        : '<' + packNum(oldText.length - newText.length); 
    
    // Contains two sequences of tokens representing the substrings with relations to each other
    var out = _diff(oldText == '' ? [] : oldText.split(/ /), newText == '' ? [] : newText.split(/ /));
    var pot = '';
    var potentialStr = '';
    var currentText;
    var oSpace = oldText.match(/ /g);
    var nSpace = newText.match(/ /g);

    if (oSpace == null) {
        oSpace=[];
    }

    if (nSpace == null) {
        nSpace=[];
    }
    
    /* Deletion from the beginning of the string */
    if (out.n[0].row != 0) {
        for(n=0; n<out.o.length && out.o[n].text==null; n++) {
            currentText = out.o[n] + (n >= oSpace.length ? '' : oSpace[n]);
            str += _newlines(currentText) + '-' + packNum(currentText.length);
        }
    }

    /* Iterate over tokens in new text */
    for (var i=0; i<out.n.length; i++) {

        /* Addition (token in new text does not exist in old) */
        if (out.n[i].text == null) {
            currentText = out.n[i] + (i >= nSpace.length ? '' : nSpace[i]);
            str += potentialStr;
            str += '*0' + _newlines(currentText) + '+' + packNum(currentText.length);
            potentialStr = '';
            pot += currentText;
        
        /* Skip, but may also be followed by deletions */
        } else {
            var dels = '';
            var nextWordInOldPos = out.n[i].row + 1;

            /* Deletion Check */

            /* 
             * If the next word has been deleted from the old text, check to see
             * if we're also missing the space following this word
             */
            if (nextWordInOldPos < out.o.length && 
                    out.o[nextWordInOldPos].text == null && i 
                    >= nSpace.length) {
                dels += '-1';
            }

            /*
             * Check old text tokens starting with the one corresponding to the position
             * after our current word, and for each of them that's deleted, append
             * the deletion operator to a temporary variable that we'll dump in a moment
             */
            for (n = nextWordInOldPos; n < out.o.length && out.o[n].text == null; n++) {
                currentText = out.o[n] + (n >= oSpace.length ? '' : oSpace[n]);
                dels += _newlines(currentText) + '-' + packNum(currentText.length);
            }

            /* Writing Operators */

            /*
             * Add the skip operator to our holding variable for skips, unless we've
             * got deletions from the previous step, in which case dump all the skip
             * operators into the changeset, followed by the deletion operators
             */
            currentText = out.n[i].text;
            if (i + 1 < out.n.length && out.n[i + 1].text == null && 
                    out.n[i].row >= oSpace.length) {
                dels = '*0+1' + dels;
                pot += ' ';
            } else {
                currentText += (i >= nSpace.length ? '' : nSpace[i]);
            }
            if (dels == '') {
                potentialStr += _newlines(currentText) + '=' + packNum(currentText.length);
            } else {
                str += potentialStr;
                str += _newlines(currentText) + '=' + packNum(currentText.length) + dels;
                potentialStr = '';
            }
        }
    }

    str = str + '$' + pot;

    result = optimizeChangeset(oldText, str);

    if (applyChangeset(oldText, result) != newText) {
      func = alert;
      //func = console.log;
        func("Changeset Generation Failed! Application yields '" + 
              applyChangeset(oldText, result) + "' instead of '" + newText + "'");
    }

    return result;
}


function mergeChangeset(base, cs1, cs2) {
  var baseDoc = base;
  var merged = '';
  var mergedBank = '';
  var pos = 0;

  var packNum = function(num) { return num.toString(36).toLowerCase(); };
  var append_part = function(part) {
    for (var i = 0; i < part.attribs.length; i++) {
      merged += "*" + part.attribs[i];
    }
    if (part.newlines > 0)
      merged += "|" + packNum(part.newlines);
    merged += part.op + packNum(part.len);
  };
  var rem_len = function(part, bank, len) {
    //count the newlines
    if (part.op == '+') {
        part.newlines -= bank.substring(0, len).split('\n').length-1;
    } else {
        part.newlines -= baseDoc.substring(pos, len).split('\n').length-1;
    }
    part.len -= len;
  }

  var parsed1 = parseChangeset(cs1);
  var parsed2 = parseChangeset(cs2);

  //the current operations that we are working with
  var part1 = parsed1.ops.next();
  var part2 = parsed2.ops.next();

  //set part1 to the next operation in ther parsed1 iterator
  var iterate1 = function() {
    if (parsed1.ops.hasNext())
      part1 = parsed1.ops.next();
    else
      part1 = null;
  };

  //set part2 to the next operation in ther parsed2 iterator
  var iterate2 = function() {
    if (parsed2.ops.hasNext())
      part2 = parsed2.ops.next();
    else
      part2 = null;
  };
  
  var oldlen = parsed1.oldlen;
  var newlen = 0;

  while (part1 && part2) {
    //When an operation occurs at the same position...
    // = = | skip
    // = + | insert the text
    // = - | remove the text
    // + + | insert cs2 changes after cs1 (this will increase the length of the document)
    // - - | combine events into single deletion (max of two lengths)
    // + - | replace deleted text with addition (Perform deletion and then addition)

    if (part1.op == '=' || part2.op == '=') {
      if (part1.op == '=' && part2.op == '=') {
        //= =
        var dPos;
        if (part1.len == part2.len) {
          dPos = part1.len;
          append_part(part1);
          iterate1();
          iterate2();
        } else if (part1.len < part2.len) {
          append_part(part1);
          dPos = part1.len;
          rem_len(part2, parsed2.bank, dPos);
          iterate1();
        } else {
          append_part(part2);
          dPos = part2.len;
          rem_len(part1, parsed1.bank, dPos);
          iterate2();
        }
        baseDoc = baseDoc.substring(dPos);
        pos += dPos;
        newlen += dPos;
        continue;
      }

      //reorder changesets so equals op always comes first
      var swapped = false;
      if (part1.op != '=') {
        var tmp = part1;
        part1 = part2;
        part2 = tmp;

        tmp = parsed1;
        parsed1 = parsed2;
        parsed2 = tmp;

        swapped = true;
      }

      if (part2.op == '+') {
        // = +
          append_part(part2);
          mergedBank += parsed2.bank.substring(0, part2.len);
          parsed2.bank = parsed2.bank.substring(part2.len);
          newlen += part2.len;
          iterate2();
      } else if (part2.op == '-') {
        // = -
        if (part2.len <= part1.len) {
          append_part(part2);
          //newlen -= part2.len;
          baseDoc = baseDoc.substring(part2.len);
          rem_len(part1, parsed1.bank, part2.len);
          if (!part1.len)
            iterate1();
          iterate2();
        } else {
          //no conflictions yet, but this will push us into that state
          //TODO: implement
          return null;
        }
      } else {
        // = ?
        return null;
      }

      //undo swap
      if (swapped) {
        var tmp = part1;
        part1 = part2;
        part2 = tmp;

        tmp = parsed1;
        parsed1 = parsed2;
        parsed2 = tmp;
      }
    } else if (part1.op == '+' && part2.op == '+') {
      // + +
      //append first addition
      append_part(part1);
      mergedBank += parsed1.bank.substring(0, part1.len);
      newlen += part1.len;
      iterate1();
      //append second addition
      append_part(part2);
      mergedBank += parsed2.bank.substring(0, part2.len);
      newlen += part2.len;
      iterate2();
      //we need to run this through optimizeChangeset afterwards

    } else if (part1.op == '-' && part2.op == '-') {
      // - -
      
      var swapped = false;
      if (part2.len > part1.len) {
        var tmp = part1;
        part1 = part2;
        part2 = tmp;

        tmp = parsed1;
        parsed1 = parsed2;
        parsed2 = tmp;

        swapped = true;
      }

      //remove the first part, which is defined to be greater than or equal to
      //the length of the second, so we can just throw away part2.
      append_part(part1);
      baseDoc = baseDoc.substring(part1.len);
      iterate1();
      iterate2();

      //undo swap
      if (swapped) {
        var tmp = part1;
        part1 = part2;
        part2 = tmp;

        tmp = parsed1;
        parsed1 = parsed2;
        parsed2 = tmp;
      }
    } else {
      // + - Swap may be needed

      var swapped = false;
      if (part2.op == '-') {
        var tmp = part1;
        part1 = part2;
        part2 = tmp;

        tmp = parsed1;
        parsed1 = parsed2;
        parsed2 = tmp;

        swapped = true;
      }

      //part1 - removal
      append_part(part1);
      baseDoc = baseDoc.substring(part1.len);
      iterate1();

      //part2 - addition
      append_part(part2);
      mergedBank += parsed2.bank.substring(0, part2.len);
      newlen += part2.len;
      iterate2();

      //undo swap
      if (swapped) {
        var tmp = part1;
        part1 = part2;
        part2 = tmp;

        tmp = parsed1;
        parsed1 = parsed2;
        parsed2 = tmp;
      }
    }
    

  }

  //apply the remainder of the other changeset (if it exists)
  if (part2) {
    var tmp = part1;
    part1 = part2;
    part2 = tmp;

    tmp = parsed1;
    parsed1 = parsed2;
    parsed2 = tmp;
  }
  while (part1) {
    switch (part1.op) {
      case '=':
        append_part(part1);
        newlen += part1.len;
        baseDoc = baseDoc.substring(part1.len);
        break;
      case '+':
        append_part(part1);
        mergedBank += parsed1.bank.substring(0, part1.len);
        parsed1.bank = parsed1.bank.substring(part1.len);
        newlen += part1.len;
        break;
      case '-':
        append_part(part1);
        baseDoc = baseDoc.substring(part1.len);
        break;
      default:
        return null;
    }
    iterate1();
  }
  //addon remaining characters in the baseDoc document
  newlen += baseDoc.length;

  //assemble the changeset
  var prefix = "Z:" + packNum(oldlen);

  if (newlen < oldlen) {
    prefix += "<" + packNum(oldlen-newlen);
  } else {
    prefix += ">" + packNum(newlen-oldlen);
  }

  merged = prefix + merged + "$" + mergedBank;

  return optimizeChangeset(base, merged);
}

