/**
 * Epub Class.
 * @param {Object} bookData
 * @param {Object} configData
 * @description Generates data in the format expected by pandoc and writes it
 * to a JSON file.
 */

const EventEmitter = require("events");
const _ = require("lodash");
const axios = require("axios");
const path = require("path");
const { URL } = require("url");
const striptags = require("striptags");
const LOCALHOST = "http://localhost:1313";

import Chapter from "@src/chapter";
import { determineBaseURL } from "@src/utils";
class Epub extends EventEmitter {
  constructor(bookData, configData) {
    super();
    this.data = bookData;
    this.config = configData;
    this.outputDir = this.config.outputDir || "site";
    this.imageDir = this.config.imageDir || "img";
  }

  title() {
    if (this.data.subtitle && this.data.reading_line) {
      return `${this.data.title}: ${this.data.subtitle} ${this.data.reading_line}`;
    } else if (this.data.subtitle) {
      return `${this.data.title}: ${this.data.subtitle}`;
    } else {
      return `${this.data.title}`;
    }
  }

  creators() {
    if (!this.data.contributor) {
      return false;
    }

    let creators = _.castArray(this.data.contributor).filter(
      contributor => contributor.type === "primary"
    );

    return creators.map(contributor => {
      let name =
        contributor.full_name ||
        `${contributor.first_name} ${contributor.last_name}`;
      let item = {
        name: name,
        role: `${contributor.role || "aut"}`
      };

      if (contributor.last_name && contributor.first_name) {
        item["file-as"] = `${contributor.last_name}, ${contributor.first_name}`;
      } else {
        name = name.split(" ");
        item["file-as"] = `${name[1]}, ${name[0]}`;
        item["fullname"] = true;
      }

      return item;
    });
  }

  contributors() {
    if (!this.data.contributor) {
      return false;
    }

    let contributors = _.castArray(this.data.contributor).filter(
      contributor => contributor.type === "secondary"
    );
    return contributors.map(contributor => {
      let name =
        contributor.full_name ||
        `${contributor.first_name} ${contributor.last_name}`;
      let item = {
        name: name,
        role: `${contributor.role || "ctb"}`
      };

      if (contributor.last_name && contributor.first_name) {
        item["file-as"] = `${contributor.last_name}, ${contributor.first_name}`;
      } else {
        name = name.split(" ");
        item["file-as"] = `${name[1]}, ${name[0]}`;
        item["fullname"] = true;
      }

      return item;
    });
  }

  publishers() {
    if (!this.data.publishers) {
      return false;
    }

    let publishers = _.castArray(this.data.publishers);
    return publishers.map(p => {
      if (p.location) {
        return `${p.name}, ${p.location}`;
      } else {
        return `${p.name}`;
      }
    });
  }

  async loadChapterURLs() {
    let chapters = this.data.chapters;
    let promiseArray = chapters.map(url =>
      axios.get(url, {
        adapter: require("axios/lib/adapters/http")
      })
    );
    let result = await Promise.all(promiseArray);
    return result;
  }

  async generate() {
    // build the data structure
    let publication = {
      title: this.title(),
      cover: this.data.promo_image,
      url: this.data.publisher[0].url,
      isbn: this.data.identifier.isbn,
      language: this.data.language,
      date: this.data.pub_date,
      creators: this.creators(),
      contributors: this.contributors(),
      publisher: this.data.publisher[0].name,
      description: striptags(this.data.description.full).replace(
        /\r?\n|\r/g,
        " "
      ),
      rights: this.data.copyright,
      css: this.getStylesheetUrl()
    };

    // load the contents and inject them into the pub data object
    let results = await this.loadChapterURLs();

    let chapterContent = results.map(r => {
      return new Chapter(r.data, publication.title, {
        outputDir: this.outputDir,
        imageDir: this.imageDir
      });
    });

    publication.pages = chapterContent;

    return new Promise(resolve => {
      resolve(publication);
      return publication;
    });
  }

  /**
   * getStylesheets
   * @returns {Array} Stylesheet Urls
   */
  getStylesheetUrl() {
    let baseURL = determineBaseURL(this.config.baseURL);
    let assetPath = path.join(baseURL, "css", "epub.css");

    let stylesheetUrl = new URL(assetPath, LOCALHOST).href.toLowerCase();

    return [stylesheetUrl];
  }
}

export default Epub;
