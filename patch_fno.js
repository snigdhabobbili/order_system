const fs = require('fs');
let c = fs.readFileSync('routes/purchase-orders.js', 'utf8');

c = c.replace("const FILE_NO_PREFIXES = ['33', '73', '74', '75'];", "const FILE_NO_PREFIXES = ['19', '33', '74', '75'];");

c = c.replace('<option value="33">33</option>\r\n                  <option value="73">73</option>\r\n                  <option value="74">74</option>\r\n                  <option value="75">75</option>', '<option value="19">19 - DE/IT</option>\r\n                  <option value="33">33 - DE/IT 2</option>\r\n                  <option value="74">74 - DE/Basis</option>\r\n                  <option value="75">75 - DE/IT 2</option>');

c = c.replace('<label>F.NO</label>\r\n                <select name="file_no_prefix"', '<label>F.NO <span class="req">*</span></label>\r\n                <select name="file_no_prefix" required id="addFnoSelect"');

c = c.replace('onclick="document.getElementById(\'addForm\').submit()">\r\n              <i class="ti ti-device-floppy"></i> Save entry', 'onclick="var sel=document.getElementById(\'addFnoSelect\');if(!sel.value){sel.focus();alert(\'Please select an F.NO before saving.\');return;}document.getElementById(\'addForm\').submit();">\r\n              <i class="ti ti-device-floppy"></i> Save entry');

fs.writeFileSync('routes/purchase-orders.js', c, 'utf8');
console.log('Done!');
