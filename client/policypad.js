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
 * Compares oldText and newText, generating a changeset of the differences.
 * @param {String} oldText The original editor text.
 * @param {String} newText The editor text after changes have been made.
 * @return A changeset representing the differences between oldText and newText.
 */

function wordDiff(file1, file2) {
    /* Text diff algorithm following Hunt and McIlroy 1976.
     * J. W. Hunt and M. D. McIlroy, An algorithm for differential file
     * comparison, Bell Telephone Laboratories CSTR #41 (1976)
     * http://www.cs.dartmouth.edu/~doug/
     *
     * Expects two arrays of strings.
     */

    var equivalenceClasses = {};
    for (var j = 0; j < file2.length; j++) {
	var line = file2[j];
	if (equivalenceClasses[line]) {
	    equivalenceClasses[line].push(j);
	} else {
	    equivalenceClasses[line] = [j];
	}
    }

    var candidates = [{file1index: -1,
		       file2index: -1,
		       chain: null}];

    for (var i = 0; i < file1.length; i++) {
	var line = file1[i];
	var file2indices = equivalenceClasses[line] || [];

	var r = 0;
	var c = candidates[0];

	for (var jX = 0; jX < file2indices.length; jX++) {
	    var j = file2indices[jX];

	    for (var s = 0; s < candidates.length; s++) {
		if ((candidates[s].file2index < j) &&
		    ((s == candidates.length - 1) ||
		     (candidates[s + 1].file2index > j)))
		    break;
	    }

	    if (s < candidates.length) {
		var newCandidate = {file1index: i,
				    file2index: j,
				    chain: candidates[s]};
		if (r == candidates.length) {
		    candidates.push(c);
		} else {
		    candidates[r] = c;
		}
		r = s + 1;
		c = newCandidate;
		if (r == candidates.length) {
		    break; // no point in examining further (j)s
		}
	    }
	}

	candidates[r] = c;
    }

    // At this point, we know the LCS: it's in the reverse of the
    // linked-list through .chain of
    // candidates[candidates.length - 1].

    // We now apply the LCS to build a "comm"-style picture of the
    // differences between file1 and file2.

    var result = [];
    var tail1 = file1.length;
    var tail2 = file2.length;
    var common = {common: []};

    function processCommon() {
	if (common.common.length) {
	    common.common.reverse();
	    result.push(common);
	    common = {common: []};
	}
    }

    for (var candidate = candidates[candidates.length - 1];
	 candidate != null;
	 candidate = candidate.chain) {
	var different = {file1: [], file2: []};

	while (--tail1 > candidate.file1index) {
	    different.file1.push(file1[tail1]);
	}

	while (--tail2 > candidate.file2index) {
	    different.file2.push(file2[tail2]);
	}

	if (different.file1.length || different.file2.length) {
	    processCommon();
	    different.file1.reverse();
	    different.file2.reverse();
	    result.push(different);
	}

	if (tail1 >= 0) {
	    common.common.push(file1[tail1]);
	}
    }

    processCommon();

    result.reverse();
    return result;
}


function generateChangeset(oldText, newText) {
    var wd = wordDiff(oldText, newText); 

    var result = 'Z:';

    var pot = '';

    result += oldText.length; // original length
    result += newText.length > oldText.length 
        ? '>' + (newText.length - oldText.length) 
        : '<' + (oldText.length - newText.length); // length change 


    $.each(wd, function(i, cs) {
        var keep = 0; // non-newline characters to keep
        var keepN = 0; // characters including newlines to keep
        var numN = 0; // number of newlines
        var ins = 0; // characters to insert
        var insN = 0; // characters including newlines to insert
        var del = 0; // characters to delete
        var delN = 0; // characters including newlines to delete

        if (cs.common != undefined) {
            common = cs.common.join('');
            keep += common.length;

            if (common.search('\n') >= 0) {
                var lastN = common.lastIndexOf('\n');
                keepN = lastN + 1;
                numN = common.match(/\n/g).length;
                keep = common.length - lastN - 1;
            }
        }

        if (cs.file1 != undefined) {
            var missing = cs.file1.join('');
            del = missing.length;
                
            if (missing.search('\n') >= 0) {
                var lastN = missing.lastIndexOf('\n');
                delN = lastN + 1;
                numN = missing.match(/\n/g).length;
                del = missing.length - lastN - 1;
            }
        }

        if (cs.file2 != undefined) {
            var added = cs.file2.join('');
            ins = added.length;
            pot += added;

            if (added.search('\n') >= 0) {
                var lastN = added.lastIndexOf('\n');
                insN = lastN + 1;
                numN = added.match(/\n/g).length;
                ins = added.length - lastN - 1;
            }
        }
        
        
        result += keepN > 0 ? '|' + numN + '=' + keepN : '';  
        result += keep > 0 ? '=' + keep : '';
        result += delN > 0 ? '|' + numN + '-' + delN : '';  
        result += del > 0 ? '-' + del : '';
        result += insN > 0 ? '|' + numN + '+' + insN : '';  
        result += ins > 0 ? '+' + ins : '';
    });

    result += pot.length > 0 ? '$' + pot : '';

    return result;
}
