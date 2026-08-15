/*
  ============================================================
  Aro LED cardíaco - ESP32 + WS2812 (FC-102 rainbow ring)
  Versión con Adafruit_NeoPixel (alternativa a FastLED)
  ------------------------------------------------------------
  IMPORTANTE: Antes de subir el código a cada placa, cambiar
  DEVICE_NAME por "claudia", "cecilia" o "nic" según corresponda.
  Todo lo demás del código es igual para las 3 placas.
  ============================================================
*/

#include <WiFi.h>
#include <ESPmDNS.h>
#include <WebSocketsServer.h>
#include <ArduinoJson.h>
#include <Adafruit_NeoPixel.h>

// ============ CONFIGURACIÓN POR DISPOSITIVO ============
#define DEVICE_NAME   "claudia"   // <-- CAMBIAR: "claudia" | "cecilia" | "nic"

// ============ WIFI ============
const char* WIFI_SSID     = "Personal-AAE";
const char* WIFI_PASSWORD = "43EE000AAE";

// ============ LED RING ============
#define LED_PIN        4      // pin de datos al que conectaste el aro
#define NUM_LEDS       16     // ajustar según la cantidad de LEDs de tu FC-102
#define MAX_BRIGHTNESS 200    // 0-255

Adafruit_NeoPixel ring(NUM_LEDS, LED_PIN, NEO_GRB + NEO_KHZ800);

// ============ WEBSOCKET (puerto 81) ============
WebSocketsServer webSocket = WebSocketsServer(81);

// ============ ESTADO GLOBAL ============
uint8_t colorA[3] = {255, 0, 0};
uint8_t colorB[3] = {0, 255, 0};
uint8_t colorC[3] = {0, 0, 255};

int  bpm   = 70;     // valor por defecto hasta que llegue el primer dato real
bool panic = false;  // modo alerta (botón "rojo fuerte" desde JS)
uint8_t brightness = MAX_BRIGHTNESS; // brillo global (0-255), controlable desde JS

unsigned long lastBeatStart = 0;
unsigned long beatInterval  = 857; // ms, calculado a partir del bpm (60000/bpm)

// ============ UTILIDADES ============

// Convierte "#RRGGBB" a un array {r,g,b}
void hexToColor(const char* hex, uint8_t* out) {
  if (hex[0] == '#') hex++;
  long num = strtol(hex, NULL, 16);
  out[0] = (num >> 16) & 0xFF;
  out[1] = (num >> 8) & 0xFF;
  out[2] = num & 0xFF;
}

void updateBeatInterval() {
  int safeBpm = constrain(bpm, 30, 220); // rango razonable de seguridad
  beatInterval = 60000UL / safeBpm;
}

// Interpola linealmente entre dos colores (0..255 = de c1 a c2)
void blendColor(uint8_t* c1, uint8_t* c2, uint8_t amount, uint8_t* out) {
  out[0] = c1[0] + ((int)(c2[0] - c1[0]) * amount) / 255;
  out[1] = c1[1] + ((int)(c2[1] - c1[1]) * amount) / 255;
  out[2] = c1[2] + ((int)(c2[2] - c1[2]) * amount) / 255;
}

// Escala un color por un factor de brillo (0..255), simulando nscale8_video
void scaleColor(uint8_t* c, uint8_t brightness, uint8_t* out) {
  out[0] = ((int)c[0] * brightness) / 255;
  out[1] = ((int)c[1] * brightness) / 255;
  out[2] = ((int)c[2] * brightness) / 255;
}

// Forma del pulso cardíaco: "lub-dub" simplificado.
// strong=true -> versión más intensa y rápida para el modo alerta
uint8_t heartEnvelope(unsigned long phase, unsigned long interval, bool strong) {
  float t = (float)phase / (float)interval; // 0..1

  float attackEnd      = strong ? 0.12 : 0.15;
  float dip             = strong ? 0.30 : 0.35;
  float secondPeakEnd   = strong ? 0.42 : 0.48;

  uint8_t minB = strong ? 40 : 15;
  uint8_t maxB = 255;

  if (t < attackEnd) {
    float p = t / attackEnd;
    return minB + (uint8_t)(p * (maxB - minB));
  } else if (t < dip) {
    float p = (t - attackEnd) / (dip - attackEnd);
    return maxB - (uint8_t)(p * (maxB - minB) * 0.6);
  } else if (t < secondPeakEnd) {
    float p = (t - dip) / (secondPeakEnd - dip);
    uint8_t base  = maxB - (uint8_t)((maxB - minB) * 0.6);
    uint8_t peak2 = strong ? maxB : (uint8_t)(maxB * 0.75);
    return base + (uint8_t)(p * (peak2 - base));
  } else {
    float p = (t - secondPeakEnd) / (1.0 - secondPeakEnd);
    uint8_t peak2 = strong ? maxB : (uint8_t)(maxB * 0.75);
    return peak2 - (uint8_t)(p * (peak2 - minB));
  }
}

// Degradado cíclico entre los 3 colores a lo largo del aro
void gradientColor(int index, uint8_t* out) {
  if (panic) {
    out[0] = 255; out[1] = 0; out[2] = 0;
    return;
  }

  float pos = (float)index / (float)NUM_LEDS * 3.0; // 3 tramos: A->B->C->A
  int seg = (int)pos;
  float frac = pos - seg;

  uint8_t* c1;
  uint8_t* c2;
  switch (seg) {
    case 0: c1 = colorA; c2 = colorB; break;
    case 1: c1 = colorB; c2 = colorC; break;
    default: c1 = colorC; c2 = colorA; break;
  }
  blendColor(c1, c2, (uint8_t)(frac * 255), out);
}

// ============ MANEJO DE MENSAJES JSON ============
void handleMessage(uint8_t num, uint8_t* payload, size_t length) {
  StaticJsonDocument<512> doc;
  DeserializationError err = deserializeJson(doc, payload, length);
  if (err) {
    Serial.print("JSON error: ");
    Serial.println(err.c_str());
    return;
  }

  const char* type = doc["type"] | "";

  if (strcmp(type, "colors") == 0) {
    // Mismo color para los 3 dispositivos
    JsonArray arr = doc["colors"];
    if (arr.size() >= 3) {
      hexToColor(arr[0], colorA);
      hexToColor(arr[1], colorB);
      hexToColor(arr[2], colorC);
    }
  }
  else if (strcmp(type, "bpm") == 0) {
    const char* target = doc["device"] | "";
    if (strlen(target) == 0 || strcmp(target, DEVICE_NAME) == 0) {
      bpm = doc["bpm"] | bpm;
      updateBeatInterval();
    }
  }
  else if (strcmp(type, "panic") == 0) {
    const char* target = doc["device"] | "";
    if (strlen(target) == 0 || strcmp(target, DEVICE_NAME) == 0) {
      panic = doc["active"] | false;
    }
  }
  else if (strcmp(type, "brightness") == 0) {
    // Va a los 3 dispositivos a la vez, igual que los colores
    int val = doc["brightness"] | brightness;
    brightness = (uint8_t)constrain(val, 0, 255);
    ring.setBrightness(brightness);
  }
}

void onWebSocketEvent(uint8_t num, WStype_t type, uint8_t* payload, size_t length) {
  switch (type) {
    case WStype_CONNECTED:
      Serial.printf("[%s] Cliente %u conectado\n", DEVICE_NAME, num);
      break;
    case WStype_DISCONNECTED:
      Serial.printf("[%s] Cliente %u desconectado\n", DEVICE_NAME, num);
      break;
    case WStype_TEXT:
      handleMessage(num, payload, length);
      break;
    default:
      break;
  }
}

// ============ SETUP ============
void setup() {
  Serial.begin(115200);

  ring.begin();
  ring.setBrightness(brightness);
  ring.clear();
  ring.show();

  WiFi.mode(WIFI_STA);
  WiFi.begin(WIFI_SSID, WIFI_PASSWORD);
  Serial.print("Conectando a WiFi");
  while (WiFi.status() != WL_CONNECTED) {
    delay(400);
    Serial.print(".");
  }
  Serial.println();
  Serial.print("Conectado. IP: ");
  Serial.println(WiFi.localIP());

  if (MDNS.begin(DEVICE_NAME)) {
    Serial.printf("mDNS activo -> ws://%s.local:81\n", DEVICE_NAME);
  } else {
    Serial.println("Error iniciando mDNS");
  }

  webSocket.begin();
  webSocket.onEvent(onWebSocketEvent);

  updateBeatInterval();
  lastBeatStart = millis();
}

// ============ LOOP ============
void loop() {
  webSocket.loop();

  unsigned long now = millis();
  unsigned long interval = panic ? beatInterval / 2 : beatInterval;
  if (interval < 200) interval = 200; // límite de seguridad

  unsigned long phase = (now - lastBeatStart);
  if (phase >= interval) {
    lastBeatStart = now;
    phase = 0;
  }

  uint8_t envelope = heartEnvelope(phase, interval, panic);

  uint8_t base[3];
  uint8_t scaled[3];
  for (int i = 0; i < NUM_LEDS; i++) {
    gradientColor(i, base);
    scaleColor(base, envelope, scaled);
    ring.setPixelColor(i, ring.Color(scaled[0], scaled[1], scaled[2]));
  }
  ring.show();
}