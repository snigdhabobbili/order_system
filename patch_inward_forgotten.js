const fs = require('fs');
let c = fs.readFileSync('routes/inward.js', 'utf8');

const oldText = `              <div class="form-group">
                <label>Received From <span class="req">*</span></label>
                <input type="text" name="received_from" required autocomplete="off"/>
              </div>
              <div class="form-group full">
                <label>Subject <span class="req">*</span></label>
                <input type="text" name="subject" required autocomplete="off"/>
              </div>
              <div class="form-group">
                <label>File No.</label>
                <input type="text" name="file_no" autocomplete="off"/>
              </div>
              <div class="form-group">
                <label>Remarks</label>
                <input type="text" name="remarks" autocomplete="off"/>
              </div>
            </div>
          </form>
        </div>
        <div class="modal-footer">
          <span class="modal-footer-note"><i class="ti ti-info-circle"></i> Suffix C.NO assigned automatically e.g. 4/A</span>`;

const newText = `              <div class="form-group">
                <label>Received From <span class="req">*</span></label>
                <input type="text" name="received_from" required autocomplete="off" list="forgotten-from-list"/>
                <datalist id="forgotten-from-list">
                  \${RECEIVED_FROM_VALUES.map(v => \`<option value="\${v}"/>\`).join('')}
                </datalist>
              </div>
              <div class="form-group full">
                <label>Subject <span class="req">*</span></label>
                <input type="text" name="subject" required autocomplete="off"/>
              </div>
              <div class="form-group">
                <label>File No.</label>
                <input type="text" name="file_no" autocomplete="off"/>
              </div>
              <div class="form-group">
                <label>Remarks</label>
                <input type="text" name="remarks" autocomplete="off"/>
              </div>
            </div>
          </form>
        </div>
        <div class="modal-footer">
          <span class="modal-footer-note"><i class="ti ti-info-circle"></i> Suffix C.NO assigned automatically e.g. 4/A</span>`;

c = c.replace(oldText, newText);
fs.writeFileSync('routes/inward.js', c, 'utf8');
console.log(c.includes('forgotten-from-list') ? 'FIXED!' : 'NOT FIXED');
