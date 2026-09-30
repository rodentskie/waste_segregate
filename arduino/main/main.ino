#include <Servo.h>

Servo myservo;

// pin
const int SERVO_PIN = 6;

// degree
const int LEFT_BIN = 0;
const int RIGHT_BIN = 180;
const int NEUTRAL = 90;

void setup() {
  myservo.attach(SERVO_PIN);
  Serial.begin(9600);
}

void loop() {
  if (Serial.available() > 0) {
    char command = Serial.read();

    if (command == 'a') {
      myservo.write(LEFT_BIN);
    }
    if (command == 'b') {
      myservo.write(RIGHT_BIN);
    }

    if (command == 'c') {
      myservo.write(NEUTRAL);
    }
  }
}
