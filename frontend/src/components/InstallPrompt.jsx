import React, { useState, useEffect } from 'react';
import { X, Download, Smartphone } from 'lucide-react';

/**
 * PWA "Add to Home Screen" install prompt.
 * Shows a bottom banner when the browser fires beforeinstallprompt.
 * Dismissed state persisted in localStorage.
 */
export default function InstallPrompt() {
  const [deferredPrompt, setDeferredPrompt] = useState(null);
  const [show, setShow] = useState(false);
  const [isIOS, setIsIOS] = useState(false);
  const [iosShow, setIosShow] = useState(false);

  useEffect(() => {
    // Check if already dismissed
    if (localStorage.getItem('pwa-dismissed')) return;

    // iOS Safari detection (no beforeinstallprompt, show manual instructions)
    const iOS = /iPad|iPhone|iPod/.test(navigator.userAgent) && !window.MSStream;
    const inStandaloneMode = window.matchMedia('(display-mode: standalone)').matches
      || window.navigator.standalone;

    if (iOS && !inStandaloneMode) {
      setIsIOS(true);
      setTimeout(() => setIosShow(true), 3000); // delay so page loads first
      return;
    }

    // Android / Chrome / Edge — listen for native prompt
    const handler = (e) => {
      e.preventDefault();
      setDeferredPrompt(e);
      setTimeout(() => setShow(true), 2000);
    };
    window.addEventListener('beforeinstallprompt', handler);
    return () => window.removeEventListener('beforeinstallprompt', handler);
  }, []);

  const handleInstall = async () => {
    if (!deferredPrompt) return;
    deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    if (outcome === 'accepted') {
      localStorage.setItem('pwa-dismissed', '1');
    }
    setDeferredPrompt(null);
    setShow(false);
  };

  const dismiss = () => {
    localStorage.setItem('pwa-dismissed', '1');
    setShow(false);
    setIosShow(false);
  };

  // Nothing to show
  if (!show && !iosShow) return null;

  return (
    <div
      data-testid="pwa-install-prompt"
      className="fixed bottom-4 left-4 right-4 sm:left-auto sm:right-4 sm:w-96 z-50 animate-in slide-in-from-bottom duration-300"
    >
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-2xl shadow-2xl p-4">
        <div className="flex items-start gap-3">
          {/* Icon */}
          <div className="w-12 h-12 bg-blue-600 rounded-xl flex items-center justify-center flex-shrink-0">
            <img src="/icon-192.png" alt="TaxTrack AU" className="w-10 h-10 rounded-lg object-cover" />
          </div>

          {/* Text */}
          <div className="flex-1 min-w-0">
            <div className="font-semibold text-slate-900 dark:text-white text-sm">
              Add TaxTrack AU to Home Screen
            </div>
            {isIOS ? (
              <div className="text-xs text-slate-500 dark:text-slate-400 mt-1 space-y-0.5">
                <div>Tap <strong>Share</strong> <span className="text-base">⬆</span> in Safari</div>
                <div>then <strong>"Add to Home Screen"</strong></div>
              </div>
            ) : (
              <div className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                Install as an app — works offline, opens instantly.
              </div>
            )}
          </div>

          {/* Dismiss */}
          <button
            data-testid="pwa-dismiss-btn"
            onClick={dismiss}
            className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 flex-shrink-0 p-0.5"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Action */}
        {!isIOS && (
          <button
            data-testid="pwa-install-btn"
            onClick={handleInstall}
            className="w-full mt-3 flex items-center justify-center gap-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl py-2.5 text-sm font-semibold transition-colors"
          >
            <Download className="w-4 h-4" />
            Install App
          </button>
        )}
      </div>
    </div>
  );
}
