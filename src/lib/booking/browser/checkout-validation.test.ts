import { expect, it } from 'vitest';
import { allowCheckoutDiagnosticRequest as allow,validateCheckoutEvidence } from './checkout-validation';
it('permits Resy auth refresh and details but no booking or account mutations',()=>{
 for(const path of ['/3/auth/refresh','/3/details']) expect(allow('POST',`https://api.resy.com${path}`)).toBe(true);
 for(const path of ['/3/book','/3/cancel','/2/user/location','/3/details/extra']) expect(allow('POST',`https://api.resy.com${path}`)).toBe(false);
 expect(allow('POST','https://evil.example/3/details')).toBe(false);
 expect(allow('DELETE','https://api.resy.com/3/details')).toBe(false);
 expect(allow('POST','http://api.resy.com/3/details')).toBe(false);
});
it('hands off missing login and incomplete financial evidence',()=>{
 expect(()=>validateCheckoutEvidence({loginVisible:true,reserveVisible:true,policies:['fee']})).toThrow();
 for(const policies of [[],['a','b'],[' ']]) expect(()=>validateCheckoutEvidence({loginVisible:false,reserveVisible:true,policies})).toThrow();
 expect(()=>validateCheckoutEvidence({loginVisible:false,reserveVisible:false,policies:['fee']})).toThrow();
});
it('reports observed policy without treating it as a booking or approved quote',()=>{
 expect(validateCheckoutEvidence({loginVisible:false,reserveVisible:true,policies:['$30 plus tax per guest']})).toMatchObject({bookingSubmitted:false,cancellationPolicy:'$30 plus tax per guest'});
});
