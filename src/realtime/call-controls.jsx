// Call controls cho live realtime voice call.
//
// Cung cấp UI điều khiển: mute mic, volume, chọn thiết bị, kết thúc call.
// Tách riêng để VoiceChat.jsx không phình to.

import { useState, useEffect, useCallback } from 'react';

/**
 * CallControls — nút điều khiển trong cuộc gọi.
 *
 * Props:
 *   isMuted: boolean
 *   onToggleMute: () => void
 *   volume: number (0-1)
 *   onVolumeChange: (level: number) => void
 *   onEndCall: () => void
 *   onSendText: (text: string) => void
 *   disabled: boolean — disable khi đang reconnecting
 */
export function CallControls({
  isMuted = false,
  onToggleMute,
  volume = 1,
  onVolumeChange,
  onEndCall,
  onSendText,
  disabled = false,
}) {
  const [showTextInput, setShowTextInput] = useState(false);
  const [textValue, setTextValue] = useState('');
  const [devices, setDevices] = useState([]);
  const [selectedDevice, setSelectedDevice] = useState('');
  const [showDeviceMenu, setShowDeviceMenu] = useState(false);

  // Enumerate audio input devices
  useEffect(() => {
    if (disabled || !navigator.mediaDevices?.enumerateDevices) return;

    const mediaDevices = navigator.mediaDevices;
    let disposed = false;
    let requestId = 0;

    const loadDevices = async () => {
      const currentRequest = ++requestId;
      try {
        const allDevices = await mediaDevices.enumerateDevices();
        if (disposed || currentRequest !== requestId) return;
        const inputs = allDevices.filter(d => d.kind === 'audioinput');
        setDevices(inputs);
        setSelectedDevice(current => (
          inputs.some(device => device.deviceId === current)
            ? current
            : inputs[0]?.deviceId || ''
        ));
      } catch {
        // Permission not granted yet — ignore
      }
    };

    loadDevices();
    mediaDevices.addEventListener('devicechange', loadDevices);
    return () => {
      disposed = true;
      mediaDevices.removeEventListener('devicechange', loadDevices);
    };
  }, [disabled]);

  const handleTextSubmit = useCallback((e) => {
    e.preventDefault();
    const text = textValue.trim();
    if (!text) return;
    onSendText?.(text);
    setTextValue('');
    setShowTextInput(false);
  }, [textValue, onSendText]);

  return (
    <div className="call-controls" style={styles.container}>
      {/* Mute button */}
      <button
        onClick={onToggleMute}
        disabled={disabled}
        style={{
          ...styles.btn,
          ...(isMuted ? styles.btnDanger : styles.btnDefault),
        }}
        title={isMuted ? 'Bật micro' : 'Tắt micro'}
        aria-label={isMuted ? 'Unmute microphone' : 'Mute microphone'}
      >
        {isMuted ? '🔇' : '🎤'}
      </button>

      {/* Volume slider */}
      <div style={styles.volumeWrap}>
        <span style={styles.volIcon}>{volume === 0 ? '🔈' : volume < 0.5 ? '🔉' : '🔊'}</span>
        <input
          type="range"
          min="0"
          max="1"
          step="0.05"
          value={volume}
          onChange={(e) => onVolumeChange?.(parseFloat(e.target.value))}
          disabled={disabled}
          style={styles.slider}
          aria-label="Volume"
        />
      </div>

      {/* Device selector */}
      {devices.length > 1 && (
        <div style={styles.deviceWrap}>
          <button
            onClick={() => setShowDeviceMenu(!showDeviceMenu)}
            disabled={disabled}
            style={styles.btnSmall}
            title="Chọn micro"
            aria-label="Select microphone device"
          >
            ⚙️
          </button>
          {showDeviceMenu && (
            <select
              value={selectedDevice}
              onChange={(e) => setSelectedDevice(e.target.value)}
              style={styles.deviceSelect}
              onBlur={() => setShowDeviceMenu(false)}
              autoFocus
            >
              {devices.map(d => (
                <option key={d.deviceId} value={d.deviceId}>
                  {d.label || `Microphone ${d.deviceId.slice(0, 8)}`}
                </option>
              ))}
            </select>
          )}
        </div>
      )}

      {/* Text input toggle */}
      <button
        onClick={() => setShowTextInput(!showTextInput)}
        disabled={disabled}
        style={{
          ...styles.btn,
          ...(showTextInput ? styles.btnActive : styles.btnDefault),
        }}
        title="Nhập text"
        aria-label="Toggle text input"
      >
        ⌨️
      </button>

      {/* End call */}
      <button
        onClick={onEndCall}
        style={{...styles.btn, ...styles.btnEnd}}
        title="Kết thúc"
        aria-label="End call"
      >
        📞
      </button>

      {/* Inline text input form */}
      {showTextInput && (
        <form onSubmit={handleTextSubmit} style={styles.textForm}>
          <input
            type="text"
            value={textValue}
            onChange={(e) => setTextValue(e.target.value)}
            placeholder="Nhập câu hỏi..."
            disabled={disabled}
            style={styles.textInput}
            autoFocus
          />
          <button type="submit" disabled={!textValue.trim() || disabled} style={styles.sendBtn}>
            Gửi
          </button>
        </form>
      )}
    </div>
  );
}

const styles = {
  container: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    padding: '8px 12px',
    background: '#1e1e2e',
    borderRadius: '12px',
    flexWrap: 'wrap',
  },
  btn: {
    width: '40px',
    height: '40px',
    border: 'none',
    borderRadius: '10px',
    cursor: 'pointer',
    fontSize: '18px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    transition: 'background 0.15s',
  },
  btnDefault: {
    background: '#313244',
    color: '#cdd6f4',
  },
  btnDanger: {
    background: '#f38ba8',
    color: '#1e1e2e',
  },
  btnActive: {
    background: '#89b4fa',
    color: '#1e1e2e',
  },
  btnEnd: {
    background: '#f38ba8',
    color: '#1e1e2e',
  },
  btnSmall: {
    width: '32px',
    height: '32px',
    border: 'none',
    borderRadius: '8px',
    background: '#313244',
    cursor: 'pointer',
    fontSize: '14px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  },
  volumeWrap: {
    display: 'flex',
    alignItems: 'center',
    gap: '4px',
  },
  volIcon: {
    fontSize: '16px',
  },
  slider: {
    width: '60px',
    accentColor: '#89b4fa',
  },
  deviceWrap: {
    position: 'relative',
  },
  deviceSelect: {
    position: 'absolute',
    bottom: '100%',
    left: '0',
    marginBottom: '4px',
    background: '#313244',
    color: '#cdd6f4',
    border: '1px solid #45475a',
    borderRadius: '8px',
    padding: '4px',
    fontSize: '12px',
    zIndex: 10,
    minWidth: '150px',
  },
  textForm: {
    display: 'flex',
    gap: '4px',
    width: '100%',
    marginTop: '4px',
  },
  textInput: {
    flex: 1,
    padding: '6px 10px',
    borderRadius: '8px',
    border: '1px solid #45475a',
    background: '#313244',
    color: '#cdd6f4',
    fontSize: '14px',
    outline: 'none',
  },
  sendBtn: {
    padding: '6px 12px',
    borderRadius: '8px',
    border: 'none',
    background: '#89b4fa',
    color: '#1e1e2e',
    cursor: 'pointer',
    fontWeight: 'bold',
    fontSize: '13px',
  },
};
