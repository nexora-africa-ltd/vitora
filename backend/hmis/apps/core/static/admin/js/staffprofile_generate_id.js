/**
 * Adds a "Generate" button next to the employee_id field on the StaffProfile
 * admin add/change form. Clicking the button generates a unique ID in the
 * same format used by StaffProfile.generate_employee_id() server-side:
 *
 *   VH-YYYY-XXXXXX  (6 random hex chars, uppercased)
 *
 * Uniqueness is still enforced by the model's save() method and the DB
 * unique constraint, so a client-side collision is harmless: the form
 * will simply fail validation and the user can click "Generate" again.
 */
(function () {
    "use strict";

    function generateEmployeeId() {
        var year = new Date().getFullYear();
        var hex = "";
        var bytes = new Uint8Array(3);
        if (window.crypto && window.crypto.getRandomValues) {
            window.crypto.getRandomValues(bytes);
            for (var i = 0; i < bytes.length; i++) {
                hex += ("0" + bytes[i].toString(16)).slice(-2);
            }
        } else {
            // Fallback for very old browsers
            hex = Math.random().toString(16).slice(2, 8);
        }
        return "VH-" + year + "-" + hex.toUpperCase();
    }

    function init() {
        var input = document.getElementById("id_employee_id");
        if (!input) return;
        if (input.dataset.generatorInstalled === "1") return;
        input.dataset.generatorInstalled = "1";

        var btn = document.createElement("button");
        btn.type = "button";
        btn.textContent = "Generate";
        btn.className = "button";
        btn.style.marginLeft = "8px";
        btn.style.padding = "4px 10px";
        btn.title = "Generate a unique employee ID (VH-YYYY-XXXXXX)";

        btn.addEventListener("click", function () {
            input.value = generateEmployeeId();
            input.dispatchEvent(new Event("change", { bubbles: true }));
        });

        // Insert immediately after the input
        if (input.parentNode) {
            input.parentNode.insertBefore(btn, input.nextSibling);
        }
    }

    if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", init);
    } else {
        init();
    }
})();
