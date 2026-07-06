import { supabase } from './supabase';

// Supabase's `storage.upload()` is built on `fetch`, which doesn't expose upload
// progress. To show a real progress bar (needed for large video files on slow
// mobile connections) we get a signed upload URL and PUT the file ourselves via
// XHR, which does support `upload.onprogress`.
const SUPABASE_ANON_KEY = 'sb_publishable_wL7A9THCYwVcyu3t6uk-3Q_Vt09bJzn';

export function uploadFileWithProgress(bucket, path, file, onProgress) {
  return new Promise(async (resolve) => {
    const { data: signed, error: signError } = await supabase.storage.from(bucket).createSignedUploadUrl(path);
    if (signError || !signed) {
      resolve({ path: null, error: signError || new Error('No se pudo iniciar la subida') });
      return;
    }

    const { data: { session } } = await supabase.auth.getSession();

    const formData = new FormData();
    formData.append('cacheControl', '3600');
    formData.append('', file);

    const xhr = new XMLHttpRequest();
    xhr.open('PUT', signed.signedUrl);
    xhr.setRequestHeader('apikey', SUPABASE_ANON_KEY);
    if (session?.access_token) xhr.setRequestHeader('Authorization', `Bearer ${session.access_token}`);
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable && onProgress) onProgress(Math.round((e.loaded / e.total) * 100));
    };
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) resolve({ path: signed.path, error: null });
      else resolve({ path: null, error: new Error(`Error al subir (${xhr.status})`) });
    };
    xhr.onerror = () => resolve({ path: null, error: new Error('Error de red al subir el archivo') });
    xhr.send(formData);
  });
}
