import {checkEnv} from 'env-precheck';
const success: boolean = checkEnv({contract:{name:'contract',text:'A='},environment:{A:'ok'}}).ok;
void success;
