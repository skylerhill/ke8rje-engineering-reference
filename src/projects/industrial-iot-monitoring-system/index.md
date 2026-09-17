---
title: Industrial Internet of Things Monitoring System
layout: entity
permalink: /projects/industrial-iot-monitoring-system/

id: industrial-iot-monitoring-system
entity: project
institution: miami-university
competencies:
  - engineering-research
  - electrical-engineering
  - electrical-design
  - embedded-systems
  - sensor-systems
  - instrumentation-measurement
  - data-acquisition
  - industrial-internet-of-things
  - wireless-communications
---

Development and evaluation of wireless embedded sensor nodes for Industrial Internet of Things applications, with an emphasis on monitoring industrial equipment and providing engineers and technicians with remotely accessible information for equipment troubleshooting and condition assessment.

The research combined custom electronics, embedded systems, environmental and vibration sensing, wireless communication, calibration, experimental testing, and engineering analysis. The work contributed to a peer-reviewed paper presented at IEEE IECON 2018.

## Engineering Research Objective

Industrial equipment troubleshooting commonly requires technicians or engineers to collect measurements directly at the equipment being investigated.

The research explored the use of distributed wireless sensor nodes to make useful equipment and environmental measurements remotely accessible through an Industrial Internet of Things architecture.

The objective was not simply to demonstrate wireless communication, but to investigate whether a low-cost embedded sensing platform could acquire useful engineering measurements and communicate those measurements reliably enough to support industrial monitoring and troubleshooting applications.

## Sensor Node Development

Wireless sensor nodes were developed to acquire physical measurements from the surrounding equipment and environment.

The nodes incorporated sensing for temperature, humidity, and vibration along with the electronics required for sensor interfacing, data acquisition, embedded processing, and wireless communication.

Development required integration of multiple engineering functions into a compact embedded platform rather than treating the sensors, electronics, and communications system as independent experiments.

## Electrical and Embedded Design

Custom electronics were developed to support the sensing and communication requirements of the system.

Electrical design activities included sensor interfacing, signal acquisition, embedded hardware integration, power considerations, and integration of the wireless communication hardware.

Embedded software coordinated sensor acquisition, processing, and communication so that measurements collected by the node could be transmitted through the larger monitoring system.

## Vibration Monitoring

Vibration sensing provided a means of observing dynamic behavior associated with operating equipment.

Unlike slowly changing environmental measurements such as temperature and humidity, vibration measurements required consideration of time-varying signals and the relationship between sensor behavior, data acquisition, and the physical equipment being monitored.

This portion of the project provided experience integrating sensor systems with measurement and data-acquisition concepts relevant to equipment condition monitoring.

## Temperature and Humidity Monitoring

Environmental measurements provided additional information about the operating conditions surrounding monitored equipment.

Temperature and humidity sensors were integrated into the embedded nodes and evaluated to determine whether the resulting measurements were suitable for the intended monitoring application.

These measurements also provided a useful platform for investigating sensor calibration, repeatability, and differences between nominal sensor specifications and actual measured performance.

## Sensor Calibration

Sensor outputs were evaluated against reference measurements to characterize measurement accuracy and determine appropriate calibration behavior.

Calibration required collecting experimental data, comparing sensor measurements against known or reference conditions, analyzing deviations, and determining how those deviations affected the usefulness of the resulting measurements.

This reinforced the distinction between successfully reading a digital sensor value and demonstrating that the resulting value represents a meaningful engineering measurement.

## LoRa Wireless Communication

LoRa wireless communication was used to transmit sensor information over distances appropriate to distributed industrial monitoring.

The communication system was evaluated experimentally rather than assuming successful packet transmission under ideal conditions represented adequate performance.

Testing considered communication reliability and the ability of the wireless architecture to transport measurement data between distributed sensing locations and the rest of the monitoring system.

## Communication Reliability Testing

Wireless performance was characterized through repeated testing to evaluate communication reliability under representative conditions.

Experimental results were used to assess the behavior of the communication system and identify limitations relevant to practical Industrial Internet of Things deployment.

This work connected embedded wireless design with experimental engineering: system performance was measured, analyzed, and evaluated rather than inferred solely from component specifications.

## System Integration

The completed system required sensors, custom electronics, embedded processing, data acquisition, wireless communication, and higher-level monitoring functions to operate together.

Integration testing evaluated the complete measurement path from the physical quantity being sensed through acquisition and embedded processing to wireless transmission and eventual availability of the measurement to the user.

This systems perspective was important because useful monitoring performance depended on the entire measurement chain rather than the performance of any individual component.

## Research and Experimental Validation

The project was conducted as engineering research, requiring technical decisions and performance claims to be supported through experimental evidence.

Testing included sensor characterization and calibration, wireless communication evaluation, system integration, and analysis of collected data.

Results were documented and evaluated in the context of the research objectives, ultimately contributing to publication and presentation of the work at IEEE IECON 2018.

## Engineering Experience

My work included electrical and embedded system development, sensor integration, custom electronics, data acquisition, sensor calibration, LoRa wireless communication, experimental design, system integration, testing, data analysis, and technical documentation.

The project provided experience across the complete development path of an embedded sensing system: identifying an engineering problem, developing hardware and software, integrating physical sensors, establishing wireless communication, experimentally characterizing system performance, and communicating the resulting engineering research through peer-reviewed publication.